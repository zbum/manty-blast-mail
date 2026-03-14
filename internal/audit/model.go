package audit

import "time"

type AuditLog struct {
	ID         uint64    `json:"id" gorm:"primaryKey"`
	ActorID    uint64    `json:"actor_id"`
	ActorName  string    `json:"actor_name" gorm:"size:255"`
	Action     string    `json:"action" gorm:"size:50"`
	TargetType string    `json:"target_type" gorm:"size:50"`
	TargetID   uint64    `json:"target_id"`
	TargetName string    `json:"target_name" gorm:"size:255"`
	Detail     string    `json:"detail" gorm:"type:text"`
	CreatedAt  time.Time `json:"created_at"`
}