package attachment

import "gorm.io/gorm"

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) Create(a *Attachment) error {
	return r.db.Create(a).Error
}

func (r *Repository) FindByCampaignID(campaignID uint64) ([]Attachment, error) {
	var attachments []Attachment
	err := r.db.Where("campaign_id = ?", campaignID).Order("id ASC").Find(&attachments).Error
	return attachments, err
}

func (r *Repository) FindByID(id uint64) (*Attachment, error) {
	var a Attachment
	if err := r.db.First(&a, id).Error; err != nil {
		return nil, err
	}
	return &a, nil
}

func (r *Repository) Delete(id uint64) error {
	return r.db.Delete(&Attachment{}, id).Error
}

func (r *Repository) DeleteByCampaignID(campaignID uint64) ([]Attachment, error) {
	var attachments []Attachment
	r.db.Where("campaign_id = ?", campaignID).Find(&attachments)
	err := r.db.Where("campaign_id = ?", campaignID).Delete(&Attachment{}).Error
	return attachments, err
}

func (r *Repository) TotalSizeByCampaign(campaignID uint64) (int64, error) {
	var totalSize int64
	err := r.db.Model(&Attachment{}).
		Where("campaign_id = ?", campaignID).
		Select("COALESCE(SUM(size), 0)").
		Scan(&totalSize).Error
	return totalSize, err
}
