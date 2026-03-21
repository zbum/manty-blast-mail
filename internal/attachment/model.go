package attachment

import "time"

type Attachment struct {
	ID          uint64    `json:"id" gorm:"primaryKey"`
	CampaignID  uint64    `json:"campaign_id" gorm:"index"`
	Filename    string    `json:"filename" gorm:"type:varchar(255)"`
	ContentType string    `json:"content_type" gorm:"type:varchar(100)"`
	Size        int64     `json:"size"`
	StoragePath string    `json:"-" gorm:"type:varchar(512)"`
	CreatedAt   time.Time `json:"created_at"`
}
