package sender

import (
	"context"
	"sync"
	"sync/atomic"
	"time"

	"github.com/rs/zerolog/log"

	"github.com/zbum/manty-blast-mail/internal/mailer"
	"github.com/zbum/manty-blast-mail/internal/recipient"
)

// SendJob represents a single email send job for a worker.
type SendJob struct {
	Recipient   recipient.Recipient
	From        string
	FromName    string
	Subject     string
	BodyType    string
	BodyHTML    string
	BodyRawMIME string
	IcsEnabled  bool
	IcsContent  string
}

// Worker processes send jobs from a channel.
type Worker struct {
	id        int
	jobs      <-chan SendJob
	mailer    *mailer.Mailer
	limiter   *RateLimiter
	progress  *ProgressCollector
	paused    *atomic.Bool
	pauseCh   chan struct{}
	wg        *sync.WaitGroup
}

// NewWorker creates a new email sending worker.
func NewWorker(id int, jobs <-chan SendJob, m *mailer.Mailer, limiter *RateLimiter, progress *ProgressCollector, paused *atomic.Bool, pauseCh chan struct{}, wg *sync.WaitGroup) *Worker {
	return &Worker{
		id:       id,
		jobs:     jobs,
		mailer:   m,
		limiter:  limiter,
		progress: progress,
		paused:   paused,
		pauseCh:  pauseCh,
		wg:       wg,
	}
}

// Start begins processing jobs in a goroutine.
func (w *Worker) Start(ctx context.Context) {
	w.wg.Add(1)
	go func() {
		defer w.wg.Done()
		for {
			select {
			case <-ctx.Done():
				return
			case job, ok := <-w.jobs:
				if !ok {
					return
				}
				w.processJob(ctx, job)
			}
		}
	}()
}

func (w *Worker) processJob(ctx context.Context, job SendJob) {
	// Check if paused; if so, wait until resumed or cancelled
	for w.paused.Load() {
		select {
		case <-ctx.Done():
			return
		case <-w.pauseCh:
		case <-time.After(500 * time.Millisecond):
		}
	}

	// Wait for rate limiter
	if err := w.limiter.Wait(ctx); err != nil {
		return
	}

	start := time.Now()

	var msg []byte
	var err error
	var smtpResp string

	switch job.BodyType {
	case "raw_mime":
		vars := make(map[string]string)
		for k, v := range job.Recipient.Variables {
			vars[k] = v
		}
		vars["Email"] = job.Recipient.Email
		vars["Name"] = job.Recipient.Name
		msg, err = mailer.BuildRawMIMEMessage(job.BodyRawMIME, vars)
	default:
		// HTML mode
		data := make(map[string]string)
		for k, v := range job.Recipient.Variables {
			data[k] = v
		}
		data["Email"] = job.Recipient.Email
		data["Name"] = job.Recipient.Name

		htmlBody, textBody, renderErr := mailer.RenderBody(job.BodyHTML, data)
		if renderErr != nil {
			err = renderErr
			break
		}

		// Render subject template
		renderedSubject, subjectErr := mailer.RenderTemplate(job.Subject, data)
		if subjectErr != nil {
			err = subjectErr
			break
		}

		var icsContent string
		if job.IcsEnabled && job.IcsContent != "" {
			icsContent, err = mailer.RenderICalendar(job.IcsContent, data)
			if err != nil {
				break
			}
		}

		msg, err = mailer.BuildHTMLMessage(
			job.From, job.FromName,
			job.Recipient.Email, job.Recipient.Name,
			renderedSubject, htmlBody, textBody,
			icsContent,
		)
	}

	duration := time.Since(start)
	result := SendResult{
		RecipientID: job.Recipient.ID,
		Email:       job.Recipient.Email,
		DurationMs:  int(duration.Milliseconds()),
	}

	if err != nil {
		result.Status = "failed"
		result.ErrorMessage = err.Error()
		log.Error().Err(err).Uint64("recipient_id", job.Recipient.ID).Msg("failed to build message")
	} else {
		smtpResp, err = w.mailer.Send(job.From, job.Recipient.Email, msg)
		if err != nil {
			result.Status = "failed"
			result.ErrorMessage = err.Error()
			log.Error().Err(err).Uint64("recipient_id", job.Recipient.ID).Msg("failed to send email")
		} else {
			result.Status = "sent"
			result.SMTPResponse = smtpResp
		}
		result.DurationMs = int(time.Since(start).Milliseconds())
	}

	w.progress.AddResult(result)
}

// Dispatcher loads recipients from the database in batches and feeds them to the worker pool.
type Dispatcher struct {
	campaignID uint64
	jobs       chan<- SendJob
	campaign   CampaignData
	batchSize  int
	loadBatch  func(campaignID uint64, offset, limit int) ([]recipient.Recipient, error)
}

// CampaignData holds campaign fields needed to construct send jobs.
type CampaignData struct {
	FromEmail   string
	FromName    string
	Subject     string
	BodyType    string
	BodyHTML    string
	BodyRawMIME string
	IcsEnabled  bool
	IcsContent  string
	TotalCount  int
}

// NewDispatcher creates a new dispatcher for feeding jobs to workers.
func NewDispatcher(campaignID uint64, jobs chan<- SendJob, campaign CampaignData, batchSize int, loadBatch func(uint64, int, int) ([]recipient.Recipient, error)) *Dispatcher {
	return &Dispatcher{
		campaignID: campaignID,
		jobs:       jobs,
		campaign:   campaign,
		batchSize:  batchSize,
		loadBatch:  loadBatch,
	}
}

// Run starts dispatching jobs. It loads recipients in batches and sends them to the job channel.
// It closes the jobs channel when all recipients have been dispatched.
func (d *Dispatcher) Run(ctx context.Context) {
	defer close(d.jobs)

	offset := 0
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		recipients, err := d.loadBatch(d.campaignID, offset, d.batchSize)
		if err != nil {
			log.Error().Err(err).Uint64("campaign_id", d.campaignID).Msg("failed to load recipients batch")
			return
		}

		if len(recipients) == 0 {
			return
		}

		for _, r := range recipients {
			job := SendJob{
				Recipient:   r,
				From:        d.campaign.FromEmail,
				FromName:    d.campaign.FromName,
				Subject:     d.campaign.Subject,
				BodyType:    d.campaign.BodyType,
				BodyHTML:    d.campaign.BodyHTML,
				BodyRawMIME: d.campaign.BodyRawMIME,
				IcsEnabled:  d.campaign.IcsEnabled,
				IcsContent:  d.campaign.IcsContent,
			}

			select {
			case <-ctx.Done():
				return
			case d.jobs <- job:
			}
		}

		offset += len(recipients)

		if len(recipients) < d.batchSize {
			return
		}
	}
}
