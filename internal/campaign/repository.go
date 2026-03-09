package campaign

import "gorm.io/gorm"

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) FindAll(page, pageSize int) ([]Campaign, int64, error) {
	var campaigns []Campaign
	var total int64

	query := r.db.Model(&Campaign{})

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	offset := (page - 1) * pageSize
	if err := query.Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&campaigns).Error; err != nil {
		return nil, 0, err
	}

	return campaigns, total, nil
}

func (r *Repository) FindAllByUserID(userID uint64, page, pageSize int) ([]Campaign, int64, error) {
	var campaigns []Campaign
	var total int64

	query := r.db.Model(&Campaign{}).Where("user_id = ?", userID)

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	offset := (page - 1) * pageSize
	if err := query.Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&campaigns).Error; err != nil {
		return nil, 0, err
	}

	return campaigns, total, nil
}

func (r *Repository) FindByID(id uint64) (*Campaign, error) {
	var c Campaign
	if err := r.db.First(&c, id).Error; err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *Repository) Create(c *Campaign) error {
	return r.db.Create(c).Error
}

func (r *Repository) Update(c *Campaign) error {
	return r.db.Save(c).Error
}

func (r *Repository) Delete(id uint64) error {
	return r.db.Delete(&Campaign{}, id).Error
}
