package report

import (
	"encoding/csv"
	"fmt"
	"io"
	"strconv"

	"github.com/zbum/manty-blast-mail/internal/crypto"
)

// Service provides report business logic.
type Service struct {
	repo *Repository
}

// NewService creates a new report service.
func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// GetLogs returns paginated send logs for a campaign.
func (s *Service) GetLogs(campaignID uint64, page, pageSize int) ([]SendLogWithRecipient, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	logs, total, err := s.repo.FindLogsByCampaignID(campaignID, page, pageSize)
	if err != nil {
		return nil, 0, err
	}
	decryptSendLogs(logs)
	return logs, total, nil
}

// GetDashboardStats returns aggregate dashboard statistics for a user.
func (s *Service) GetDashboardStats(userID uint64) (*DashboardStats, error) {
	return s.repo.GetDashboardStats(userID)
}

// GetDashboardStatsAll returns aggregate dashboard statistics for all campaigns (admin).
func (s *Service) GetDashboardStatsAll() (*DashboardStats, error) {
	return s.repo.GetDashboardStatsAll()
}

func decryptSendLogs(logs []SendLogWithRecipient) {
	for i := range logs {
		if d, err := crypto.Decrypt(logs[i].Email); err == nil {
			logs[i].Email = d
		}
		if d, err := crypto.Decrypt(logs[i].Name); err == nil {
			logs[i].Name = d
		}
	}
}

// ExportCSV writes send log data for a campaign as CSV to the given writer.
func (s *Service) ExportCSV(campaignID uint64, w io.Writer) error {
	logs, err := s.repo.GetLogsByCampaignIDAll(campaignID)
	if err != nil {
		return fmt.Errorf("load logs for export: %w", err)
	}
	decryptSendLogs(logs)

	csvWriter := csv.NewWriter(w)
	defer csvWriter.Flush()

	// Write header
	header := []string{
		"ID", "Campaign ID", "Recipient ID", "Email", "Name",
		"Status", "Error Message", "SMTP Response", "Duration (ms)", "Created At",
	}
	if err := csvWriter.Write(header); err != nil {
		return fmt.Errorf("write csv header: %w", err)
	}

	// Write rows
	for _, l := range logs {
		row := []string{
			strconv.FormatUint(l.ID, 10),
			strconv.FormatUint(l.CampaignID, 10),
			strconv.FormatUint(l.RecipientID, 10),
			l.Email,
			l.Name,
			l.Status,
			l.ErrorMessage,
			l.SMTPResponse,
			strconv.Itoa(l.DurationMs),
			l.CreatedAt.Format("2006-01-02 15:04:05"),
		}
		if err := csvWriter.Write(row); err != nil {
			return fmt.Errorf("write csv row: %w", err)
		}
	}

	return nil
}
