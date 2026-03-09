package report

import (
	"time"

	"gorm.io/gorm"
)

// SendLog represents a log entry for a sent or failed email.
type SendLog struct {
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
func (SendLog) TableName() string {
	return "send_logs"
}

// SendLogWithRecipient is a SendLog joined with recipient information.
type SendLogWithRecipient struct {
	SendLog
	Email string `json:"email"`
	Name  string `json:"name"`
}

// DashboardStats holds aggregate statistics for the dashboard.
type DashboardStats struct {
	TotalCampaigns  int64             `json:"total_campaigns"`
	TotalSent       int64             `json:"total_sent"`
	TotalFailed     int64             `json:"total_failed"`
	RecentCampaigns []RecentCampaign  `json:"recent_campaigns"`
}

// RecentCampaign holds summary info for a recently active campaign.
type RecentCampaign struct {
	ID          uint64    `json:"id"`
	Name        string    `json:"name"`
	Status      string    `json:"status"`
	TotalCount  int       `json:"total_count"`
	SentCount   int       `json:"sent_count"`
	FailedCount int       `json:"failed_count"`
	CreatedAt   time.Time `json:"created_at"`
}

// Repository handles database operations for reports.
type Repository struct {
	db *gorm.DB
}

// NewRepository creates a new report repository.
func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// FindLogsByCampaignID returns paginated send logs for a campaign with recipient info.
func (r *Repository) FindLogsByCampaignID(campaignID uint64, page, pageSize int) ([]SendLogWithRecipient, int64, error) {
	var logs []SendLogWithRecipient
	var total int64

	query := r.db.Table("send_logs").
		Select("send_logs.*, recipients.email, recipients.name").
		Joins("LEFT JOIN recipients ON send_logs.recipient_id = recipients.id").
		Where("send_logs.campaign_id = ?", campaignID)

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	offset := (page - 1) * pageSize
	if err := query.Order("send_logs.created_at DESC").
		Offset(offset).Limit(pageSize).
		Scan(&logs).Error; err != nil {
		return nil, 0, err
	}

	return logs, total, nil
}

// GetDashboardStats returns aggregate statistics for a user's campaigns.
func (r *Repository) GetDashboardStats(userID uint64) (*DashboardStats, error) {
	return r.getDashboardStatsWithFilter("user_id = ?", userID)
}

// GetDashboardStatsAll returns aggregate statistics for all campaigns (admin).
func (r *Repository) GetDashboardStatsAll() (*DashboardStats, error) {
	return r.getDashboardStatsWithFilter("1 = 1")
}

func (r *Repository) getDashboardStatsWithFilter(where string, args ...interface{}) (*DashboardStats, error) {
	stats := &DashboardStats{}

	// Total campaigns
	if err := r.db.Table("campaigns").
		Where(where, args...).
		Count(&stats.TotalCampaigns).Error; err != nil {
		return nil, err
	}

	// Total sent across all campaigns
	var sentResult struct{ Total int64 }
	if err := r.db.Table("campaigns").
		Select("COALESCE(SUM(sent_count), 0) as total").
		Where(where, args...).
		Scan(&sentResult).Error; err != nil {
		return nil, err
	}
	stats.TotalSent = sentResult.Total

	// Total failed across all campaigns
	var failedResult struct{ Total int64 }
	if err := r.db.Table("campaigns").
		Select("COALESCE(SUM(failed_count), 0) as total").
		Where(where, args...).
		Scan(&failedResult).Error; err != nil {
		return nil, err
	}
	stats.TotalFailed = failedResult.Total

	// Recent campaigns (last 10)
	var recent []RecentCampaign
	if err := r.db.Table("campaigns").
		Select("id, name, status, total_count, sent_count, failed_count, created_at").
		Where(where, args...).
		Order("created_at DESC").
		Limit(10).
		Scan(&recent).Error; err != nil {
		return nil, err
	}
	stats.RecentCampaigns = recent

	return stats, nil
}

// GetLogsByCampaignIDAll returns all send logs for a campaign (for CSV export).
func (r *Repository) GetLogsByCampaignIDAll(campaignID uint64) ([]SendLogWithRecipient, error) {
	var logs []SendLogWithRecipient

	if err := r.db.Table("send_logs").
		Select("send_logs.*, recipients.email, recipients.name").
		Joins("LEFT JOIN recipients ON send_logs.recipient_id = recipients.id").
		Where("send_logs.campaign_id = ?", campaignID).
		Order("send_logs.created_at ASC").
		Scan(&logs).Error; err != nil {
		return nil, err
	}

	return logs, nil
}
