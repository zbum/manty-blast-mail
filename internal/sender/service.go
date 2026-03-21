package sender

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/rs/zerolog/log"
	"gorm.io/gorm"

	"github.com/zbum/manty-blast-mail/internal/attachment"
	"github.com/zbum/manty-blast-mail/internal/audit"
	"github.com/zbum/manty-blast-mail/internal/auth"
	"github.com/zbum/manty-blast-mail/internal/campaign"
	"github.com/zbum/manty-blast-mail/internal/config"
	"github.com/zbum/manty-blast-mail/internal/mailer"
	"github.com/zbum/manty-blast-mail/internal/recipient"
	ws "github.com/zbum/manty-blast-mail/internal/websocket"
)

// CampaignRunner manages the sending lifecycle for a single campaign.
type CampaignRunner struct {
	ctx       context.Context
	cancel    context.CancelFunc
	limiter   *RateLimiter
	progress  *ProgressCollector
	paused    *atomic.Bool
	pauseCh   chan struct{}
	status    string
	mu        sync.Mutex
}

// Service orchestrates campaign sending operations.
type Service struct {
	db           *gorm.DB
	mailer       *mailer.Mailer
	hub          *ws.Hub
	cfg          config.SenderConfig
	auditService *audit.Service
	runners      map[uint64]*CampaignRunner
	mu           sync.RWMutex
}

// NewService creates a new SendService.
func NewService(db *gorm.DB, m *mailer.Mailer, hub *ws.Hub, cfg config.SenderConfig, auditService *audit.Service) *Service {
	return &Service{
		db:           db,
		mailer:       m,
		hub:          hub,
		cfg:          cfg,
		auditService: auditService,
		runners:      make(map[uint64]*CampaignRunner),
	}
}

// RecoverStuckCampaigns resets campaigns stuck in "sending" status on startup.
func (s *Service) RecoverStuckCampaigns() {
	s.db.Model(&campaign.Campaign{}).
		Where("status = ?", "sending").
		Update("status", "paused")
}

// GetProgress returns the current progress for a campaign, if it is running.
func (s *Service) GetProgress(campaignID uint64) (*ProgressData, bool) {
	s.mu.RLock()
	runner, ok := s.runners[campaignID]
	s.mu.RUnlock()
	if !ok {
		return nil, false
	}
	data := runner.progress.GetProgress()
	return &data, true
}

// SetRate dynamically changes the send rate for a running campaign.
func (s *Service) SetRate(campaignID uint64, ratePerSec int) error {
	if ratePerSec < 1 {
		return fmt.Errorf("rate must be at least 1")
	}
	if ratePerSec > s.cfg.MaxRateLimit {
		return fmt.Errorf("rate exceeds maximum of %d", s.cfg.MaxRateLimit)
	}

	s.mu.RLock()
	runner, ok := s.runners[campaignID]
	s.mu.RUnlock()
	if !ok {
		return fmt.Errorf("campaign %d is not running", campaignID)
	}

	runner.limiter.SetRate(ratePerSec)
	runner.progress.SetRate(ratePerSec)

	// Update campaign rate limit in DB
	s.db.Model(&campaign.Campaign{}).Where("id = ?", campaignID).Update("rate_limit", ratePerSec)

	return nil
}

// Start begins sending a campaign.
func (s *Service) Start(campaignID uint64) error {
	s.mu.Lock()
	if _, ok := s.runners[campaignID]; ok {
		s.mu.Unlock()
		return fmt.Errorf("campaign %d is already running", campaignID)
	}
	s.mu.Unlock()

	// Load campaign from DB
	var c campaign.Campaign
	if err := s.db.First(&c, campaignID).Error; err != nil {
		return fmt.Errorf("load campaign: %w", err)
	}

	if c.Status != "draft" && c.Status != "paused" {
		return fmt.Errorf("campaign %d cannot be started (status: %s)", campaignID, c.Status)
	}

	// Validate campaign has content
	if c.Subject == "" {
		return fmt.Errorf("campaign has no subject")
	}
	if c.BodyType == "raw_mime" && c.BodyRawMIME == "" {
		return fmt.Errorf("campaign has no email content")
	}
	if c.BodyType != "raw_mime" && c.BodyHTML == "" {
		return fmt.Errorf("campaign has no email content")
	}
	if c.FromEmail == "" {
		return fmt.Errorf("campaign has no sender email")
	}

	// Count pending recipients
	var totalPending int64
	s.db.Model(&recipient.Recipient{}).Where("campaign_id = ? AND status = ?", campaignID, "pending").Count(&totalPending)
	if totalPending == 0 {
		return fmt.Errorf("no pending recipients for campaign %d", campaignID)
	}

	// Update campaign status
	c.Status = "sending"
	c.TotalCount = int(totalPending) + c.SentCount + c.FailedCount
	s.db.Save(&c)

	ctx, cancel := context.WithCancel(context.Background())
	paused := &atomic.Bool{}
	pauseCh := make(chan struct{}, 1)

	rateLimit := c.RateLimit
	if rateLimit == 0 {
		rateLimit = s.cfg.DefaultRateLimit
	}
	limiter := NewRateLimiter(rateLimit)

	broadcastFn := func(event string, data interface{}) {
		s.hub.BroadcastToCampaign(campaignID, event, data)
	}

	progress := NewProgressCollector(campaignID, int(totalPending), rateLimit, broadcastFn)

	runner := &CampaignRunner{
		ctx:      ctx,
		cancel:   cancel,
		limiter:  limiter,
		progress: progress,
		paused:   paused,
		pauseCh:  pauseCh,
		status:   "sending",
	}

	s.mu.Lock()
	s.runners[campaignID] = runner
	s.mu.Unlock()

	// Start the send pipeline
	go s.runCampaign(ctx, campaignID, runner, c)

	log.Info().Uint64("campaign_id", campaignID).Int("pending", int(totalPending)).Msg("campaign sending started")
	return nil
}

func (s *Service) runCampaign(ctx context.Context, campaignID uint64, runner *CampaignRunner, c campaign.Campaign) {
	defer func() {
		s.mu.Lock()
		delete(s.runners, campaignID)
		s.mu.Unlock()
	}()

	jobs := make(chan SendJob, s.cfg.WorkerCount*2)

	// Load file attachments
	attachmentRepo := attachment.NewRepository(s.db)
	atts, _ := attachmentRepo.FindByCampaignID(campaignID)
	var attachmentData []mailer.AttachmentData
	for _, a := range atts {
		data, err := os.ReadFile(a.StoragePath)
		if err != nil {
			log.Error().Err(err).Str("path", a.StoragePath).Msg("failed to read attachment file")
			continue
		}
		attachmentData = append(attachmentData, mailer.AttachmentData{
			Filename:    a.Filename,
			ContentType: a.ContentType,
			Data:        data,
		})
	}

	campaignData := CampaignData{
		FromEmail:   c.FromEmail,
		FromName:    c.FromName,
		Subject:     c.Subject,
		BodyType:    c.BodyType,
		BodyHTML:    c.BodyHTML,
		BodyRawMIME: c.BodyRawMIME,
		IcsEnabled:  c.IcsEnabled,
		IcsContent:  c.IcsContent,
		Attachments: attachmentData,
		TotalCount:  c.TotalCount,
	}

	loadBatch := func(cID uint64, offset, limit int) ([]recipient.Recipient, error) {
		var recipients []recipient.Recipient
		err := s.db.Where("campaign_id = ? AND status = ?", cID, "pending").
			Offset(offset).Limit(limit).
			Find(&recipients).Error
		if err == nil {
			recipient.DecryptRecipients(recipients)
		}
		return recipients, err
	}

	dispatcher := NewDispatcher(campaignID, jobs, campaignData, s.cfg.BatchSize, loadBatch)

	// Start workers
	var wg sync.WaitGroup
	for i := 0; i < s.cfg.WorkerCount; i++ {
		w := NewWorker(i, jobs, s.mailer, runner.limiter, runner.progress, runner.paused, runner.pauseCh, &wg)
		w.Start(ctx)
	}

	// Start dispatcher
	dispatcher.Run(ctx)

	// Wait for all workers to finish
	wg.Wait()

	// Stop the ticker goroutine
	runner.progress.Stop()

	// Flush remaining results and broadcast
	remainingResults := runner.progress.FlushResults()
	if len(remainingResults) > 0 {
		s.hub.BroadcastToCampaign(campaignID, "send_results", map[string]interface{}{
			"campaign_id": campaignID,
			"results":     remainingResults,
		})
	}

	// Save all accumulated results to database
	s.saveResults(campaignID, runner)

	// Determine final status
	finalStatus := "completed"
	select {
	case <-ctx.Done():
		runner.mu.Lock()
		st := runner.status
		runner.mu.Unlock()
		if st == "cancelled" {
			finalStatus = "cancelled"
		}
	default:
	}

	// Update campaign status in DB
	progressData := runner.progress.GetProgress()
	s.db.Model(&campaign.Campaign{}).Where("id = ?", campaignID).Updates(map[string]interface{}{
		"status":       finalStatus,
		"sent_count":   gorm.Expr("sent_count + ?", progressData.SentCount),
		"failed_count": gorm.Expr("failed_count + ?", progressData.FailedCount),
	})

	runner.progress.SetStatus(finalStatus)

	log.Info().
		Uint64("campaign_id", campaignID).
		Str("status", finalStatus).
		Int("sent", progressData.SentCount).
		Int("failed", progressData.FailedCount).
		Msg("campaign sending finished")
}

func (s *Service) saveResults(campaignID uint64, runner *CampaignRunner) {
	results := runner.progress.GetAllResults()

	const batchSize = 100
	for i := 0; i < len(results); i += batchSize {
		end := i + batchSize
		if end > len(results) {
			end = len(results)
		}
		batch := results[i:end]
		s.db.Transaction(func(tx *gorm.DB) error {
			txRepo := recipient.NewRepository(tx)
			for _, r := range batch {
				if err := txRepo.UpdateStatus(r.RecipientID, r.Status, r.ErrorMessage); err != nil {
					log.Error().Err(err).Uint64("recipient_id", r.RecipientID).Msg("failed to update recipient status")
				}
			}
			return nil
		})
	}

	log.Info().Uint64("campaign_id", campaignID).Int("count", len(results)).Msg("saved recipient statuses to database")
}

// Pause pauses a running campaign.
func (s *Service) Pause(campaignID uint64) error {
	s.mu.RLock()
	runner, ok := s.runners[campaignID]
	s.mu.RUnlock()
	if !ok {
		return fmt.Errorf("campaign %d is not running", campaignID)
	}

	runner.mu.Lock()
	runner.paused.Store(true)
	runner.status = "paused"
	runner.mu.Unlock()

	runner.progress.SetStatus("paused")

	s.db.Model(&campaign.Campaign{}).Where("id = ?", campaignID).Update("status", "paused")

	log.Info().Uint64("campaign_id", campaignID).Msg("campaign paused")
	return nil
}

// Resume resumes a paused campaign.
func (s *Service) Resume(campaignID uint64) error {
	s.mu.RLock()
	runner, ok := s.runners[campaignID]
	s.mu.RUnlock()
	if !ok {
		return fmt.Errorf("campaign %d is not running", campaignID)
	}

	runner.mu.Lock()
	runner.paused.Store(false)
	runner.status = "sending"
	runner.mu.Unlock()

	// Signal workers to resume
	select {
	case runner.pauseCh <- struct{}{}:
	default:
	}

	runner.progress.SetStatus("sending")

	s.db.Model(&campaign.Campaign{}).Where("id = ?", campaignID).Update("status", "sending")

	log.Info().Uint64("campaign_id", campaignID).Msg("campaign resumed")
	return nil
}

// Cancel cancels a running campaign.
func (s *Service) Cancel(campaignID uint64) error {
	s.mu.RLock()
	runner, ok := s.runners[campaignID]
	s.mu.RUnlock()
	if !ok {
		return fmt.Errorf("campaign %d is not running", campaignID)
	}

	runner.mu.Lock()
	runner.status = "cancelled"
	runner.mu.Unlock()

	runner.cancel()

	log.Info().Uint64("campaign_id", campaignID).Msg("campaign cancelled")
	return nil
}

// --- HTTP Handlers ---

func (s *Service) HandleStart(w http.ResponseWriter, r *http.Request) {
	campaignID, err := parseIDParam(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Load campaign info for audit before starting
	var c campaign.Campaign
	s.db.First(&c, campaignID)

	if err := s.Start(campaignID); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Audit log
	actorID, _ := r.Context().Value(auth.UserIDKey).(uint64)
	var actor auth.User
	s.db.First(&actor, actorID)
	var recipientCount int64
	s.db.Model(&recipient.Recipient{}).Where("campaign_id = ? AND status = ?", campaignID, "pending").Count(&recipientCount)
	s.auditService.LogMailSend(actorID, actor.Username, campaignID, c.Name, "start", int(recipientCount))

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"message":     "campaign sending started",
		"campaign_id": campaignID,
	})
}

func (s *Service) HandlePause(w http.ResponseWriter, r *http.Request) {
	campaignID, err := parseIDParam(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	if err := s.Pause(campaignID); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"message":     "campaign paused",
		"campaign_id": campaignID,
	})
}

func (s *Service) HandleResume(w http.ResponseWriter, r *http.Request) {
	campaignID, err := parseIDParam(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	if err := s.Resume(campaignID); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"message":     "campaign resumed",
		"campaign_id": campaignID,
	})
}

func (s *Service) HandleCancel(w http.ResponseWriter, r *http.Request) {
	campaignID, err := parseIDParam(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	if err := s.Cancel(campaignID); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"message":     "campaign cancelled",
		"campaign_id": campaignID,
	})
}

type setRateRequest struct {
	Rate int `json:"rate"`
}

func (s *Service) HandleSetRate(w http.ResponseWriter, r *http.Request) {
	campaignID, err := parseIDParam(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	var req setRateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := s.SetRate(campaignID, req.Rate); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"message":     "rate updated",
		"campaign_id": campaignID,
		"rate":        req.Rate,
	})
}

// --- Helpers ---

func parseIDParam(r *http.Request) (uint64, error) {
	idStr := chi.URLParam(r, "id")
	if idStr == "" {
		return 0, fmt.Errorf("missing campaign id")
	}
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid campaign id: %s", idStr)
	}
	return id, nil
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}

// SendLogEntry represents a log entry for a sent email.
type SendLogEntry struct {
	ID           uint64    `json:"id" gorm:"primaryKey"`
	CampaignID   uint64    `json:"campaign_id"`
	RecipientID  uint64    `json:"recipient_id"`
	Status       string    `json:"status" gorm:"type:varchar(20)"`
	ErrorMessage string    `json:"error_message,omitempty"`
	SMTPResponse string    `json:"smtp_response"`
	DurationMs   int       `json:"duration_ms"`
	CreatedAt    time.Time `json:"created_at"`
}

// TableName overrides the table name for GORM.
func (SendLogEntry) TableName() string {
	return "send_logs"
}
