package sender

import (
	"sync"
	"time"
)

type SendResult struct {
	RecipientID  uint64 `json:"recipient_id"`
	Email        string `json:"email"`
	Status       string `json:"status"`
	ErrorMessage string `json:"error_message,omitempty"`
	SMTPResponse string `json:"smtp_response,omitempty"`
	DurationMs   int    `json:"duration_ms"`
}

type ProgressData struct {
	CampaignID  uint64  `json:"campaign_id"`
	TotalCount  int     `json:"total_count"`
	SentCount   int     `json:"sent_count"`
	FailedCount int     `json:"failed_count"`
	Rate        int     `json:"rate"`
	Status      string  `json:"status"`
	Progress    float64 `json:"progress"`
}

type ProgressCollector struct {
	campaignID uint64
	total      int
	sent       int
	failed     int
	rate       int
	status     string
	results    []SendResult
	allResults []SendResult
	mu         sync.Mutex
	broadcast  func(event string, data interface{})
}

func NewProgressCollector(campaignID uint64, total int, rate int, broadcast func(string, interface{})) *ProgressCollector {
	pc := &ProgressCollector{
		campaignID: campaignID,
		total:      total,
		rate:       rate,
		status:     "sending",
		broadcast:  broadcast,
	}
	go pc.ticker()
	return pc
}

func (pc *ProgressCollector) AddResult(result SendResult) {
	pc.mu.Lock()
	defer pc.mu.Unlock()
	if result.Status == "sent" {
		pc.sent++
	} else {
		pc.failed++
	}
	pc.results = append(pc.results, result)
	pc.allResults = append(pc.allResults, result)
}

func (pc *ProgressCollector) SetRate(r int) {
	pc.mu.Lock()
	defer pc.mu.Unlock()
	pc.rate = r
}

func (pc *ProgressCollector) SetStatus(s string) {
	pc.mu.Lock()
	pc.status = s
	progress := float64(0)
	if pc.total > 0 {
		progress = float64(pc.sent+pc.failed) / float64(pc.total) * 100
	}
	data := ProgressData{
		CampaignID:  pc.campaignID,
		TotalCount:  pc.total,
		SentCount:   pc.sent,
		FailedCount: pc.failed,
		Rate:        pc.rate,
		Status:      s,
		Progress:    progress,
	}
	pc.mu.Unlock()

	// Send final progress so UI updates counts
	pc.broadcast("progress", data)
	// Send status change
	pc.broadcast("status_change", map[string]interface{}{
		"campaign_id": pc.campaignID,
		"status":      s,
	})
}

func (pc *ProgressCollector) GetProgress() ProgressData {
	pc.mu.Lock()
	defer pc.mu.Unlock()
	progress := float64(0)
	if pc.total > 0 {
		progress = float64(pc.sent+pc.failed) / float64(pc.total) * 100
	}
	return ProgressData{
		CampaignID:  pc.campaignID,
		TotalCount:  pc.total,
		SentCount:   pc.sent,
		FailedCount: pc.failed,
		Rate:        pc.rate,
		Status:      pc.status,
		Progress:    progress,
	}
}

func (pc *ProgressCollector) GetAllResults() []SendResult {
	pc.mu.Lock()
	defer pc.mu.Unlock()
	results := make([]SendResult, len(pc.allResults))
	copy(results, pc.allResults)
	return results
}

func (pc *ProgressCollector) FlushResults() []SendResult {
	pc.mu.Lock()
	defer pc.mu.Unlock()
	results := pc.results
	pc.results = nil
	return results
}

func (pc *ProgressCollector) ticker() {
	progressTicker := time.NewTicker(1 * time.Second)
	resultsTicker := time.NewTicker(2 * time.Second)
	defer progressTicker.Stop()
	defer resultsTicker.Stop()
	for {
		select {
		case <-progressTicker.C:
			data := pc.GetProgress()
			if data.Status != "sending" && data.Status != "paused" {
				return
			}
			pc.broadcast("progress", data)
		case <-resultsTicker.C:
			results := pc.FlushResults()
			if len(results) > 0 {
				pc.broadcast("send_results", map[string]interface{}{
					"campaign_id": pc.campaignID,
					"results":     results,
				})
			}
		}
	}
}
