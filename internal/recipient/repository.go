package recipient

import "gorm.io/gorm"

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// FindByCampaignID returns a paginated list of recipients for the given campaign,
// along with the total count. If search is non-empty, filters by email or name.
func (r *Repository) FindByCampaignID(campaignID uint64, page, pageSize int, search string) ([]Recipient, int64, error) {
	var recipients []Recipient
	var total int64

	query := r.db.Model(&Recipient{}).Where("campaign_id = ?", campaignID)

	if search != "" {
		like := "%" + search + "%"
		query = query.Where("email LIKE ? OR name LIKE ?", like, like)
	}

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	offset := (page - 1) * pageSize
	if err := query.Order("id ASC").Offset(offset).Limit(pageSize).Find(&recipients).Error; err != nil {
		return nil, 0, err
	}

	return recipients, total, nil
}

// FindPendingBatch returns up to batchSize recipients with status "pending" for the
// given campaign. Used by the sender engine to fetch the next batch of emails to send.
func (r *Repository) FindPendingBatch(campaignID uint64, batchSize int) ([]Recipient, error) {
	var recipients []Recipient
	err := r.db.Where("campaign_id = ? AND status = ?", campaignID, "pending").
		Order("id ASC").
		Limit(batchSize).
		Find(&recipients).Error
	return recipients, err
}

// BatchCreate inserts multiple recipients in a single batch operation.
func (r *Repository) BatchCreate(recipients []Recipient) error {
	if len(recipients) == 0 {
		return nil
	}
	return r.db.CreateInBatches(recipients, 500).Error
}

// BatchUpdateStatus updates the status of multiple recipients identified by their IDs.
func (r *Repository) BatchUpdateStatus(ids []uint64, status string) error {
	if len(ids) == 0 {
		return nil
	}
	return r.db.Model(&Recipient{}).Where("id IN ?", ids).Update("status", status).Error
}

// UpdateStatus updates the status and optional error message for a single recipient.
func (r *Repository) UpdateStatus(id uint64, status string, errorMsg string) error {
	updates := map[string]interface{}{
		"status":        status,
		"error_message": errorMsg,
	}
	return r.db.Model(&Recipient{}).Where("id = ?", id).Updates(updates).Error
}

// DeleteByID deletes a single recipient by ID and campaign ID.
func (r *Repository) DeleteByID(id uint64, campaignID uint64) error {
	return r.db.Where("id = ? AND campaign_id = ?", id, campaignID).Delete(&Recipient{}).Error
}

// DeleteByCampaignID deletes all recipients for the given campaign.
func (r *Repository) DeleteByCampaignID(campaignID uint64) error {
	return r.db.Where("campaign_id = ?", campaignID).Delete(&Recipient{}).Error
}
