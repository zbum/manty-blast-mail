package campaign

import "time"

type Campaign struct {
	ID          uint64    `json:"id" gorm:"primaryKey"`
	UserID      uint64    `json:"user_id"`
	Name        string    `json:"name"`
	Subject     string    `json:"subject"`
	BodyType    string    `json:"body_type" gorm:"type:enum('html','raw_mime');default:'html'"`
	BodyHTML    string    `json:"body_html" gorm:"column:body_html;type:longtext"`
	BodyRawMIME string    `json:"body_raw_mime" gorm:"column:body_raw_mime;type:longtext"`
	FromName    string    `json:"from_name"`
	FromEmail   string    `json:"from_email"`
	IcsEnabled  bool      `json:"ics_enabled"`
	IcsContent  string    `json:"ics_content"`
	Status      string    `json:"status" gorm:"type:enum('draft','sending','paused','completed','cancelled');default:'draft'"`
	TotalCount  int       `json:"total_count" gorm:"default:0"`
	SentCount   int       `json:"sent_count" gorm:"default:0"`
	FailedCount int       `json:"failed_count" gorm:"default:0"`
	RateLimit   int       `json:"rate_limit" gorm:"default:10"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}
