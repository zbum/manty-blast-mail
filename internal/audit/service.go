package audit

import (
	"encoding/json"
	"fmt"

	"github.com/rs/zerolog/log"
	"github.com/zbum/manty-blast-mail/internal/search"
	"gorm.io/gorm"
)

type Service struct {
	repo    *Repository
	indexer *search.Indexer
}

func NewService(db *gorm.DB, indexer *search.Indexer) *Service {
	return &Service{repo: NewRepository(db), indexer: indexer}
}

func (s *Service) LogRoleChange(actorID uint64, actorName string, targetID uint64, targetName, oldRole, newRole string) {
	detail, _ := json.Marshal(map[string]string{
		"old_role": oldRole,
		"new_role": newRole,
	})

	entry := &AuditLog{
		ActorID:    actorID,
		ActorName:  actorName,
		Action:     "role_change",
		TargetType: "user",
		TargetID:   targetID,
		TargetName: targetName,
		Detail:     string(detail),
	}
	if err := s.repo.Create(entry); err != nil {
		log.Error().Err(err).Msg("failed to write audit log for role change")
	} else {
		s.indexAuditEntry(entry)
	}
}

func (s *Service) LogMailSend(actorID uint64, actorName string, campaignID uint64, campaignName, action string, recipientCount int) {
	detail, _ := json.Marshal(map[string]interface{}{
		"campaign_name":   campaignName,
		"action":          action,
		"recipient_count": recipientCount,
	})

	entry := &AuditLog{
		ActorID:    actorID,
		ActorName:  actorName,
		Action:     fmt.Sprintf("mail_%s", action),
		TargetType: "campaign",
		TargetID:   campaignID,
		TargetName: campaignName,
		Detail:     string(detail),
	}
	if err := s.repo.Create(entry); err != nil {
		log.Error().Err(err).Msg("failed to write audit log for mail send")
	} else {
		s.indexAuditEntry(entry)
	}
}

func (s *Service) LogUserCreate(actorID uint64, actorName string, targetID uint64, targetName string) {
	entry := &AuditLog{
		ActorID:    actorID,
		ActorName:  actorName,
		Action:     "user_create",
		TargetType: "user",
		TargetID:   targetID,
		TargetName: targetName,
		Detail:     fmt.Sprintf(`{"username":"%s"}`, targetName),
	}
	if err := s.repo.Create(entry); err != nil {
		log.Error().Err(err).Msg("failed to write audit log for user create")
	} else {
		s.indexAuditEntry(entry)
	}
}

func (s *Service) LogUserDelete(actorID uint64, actorName string, targetID uint64, targetName string) {
	entry := &AuditLog{
		ActorID:    actorID,
		ActorName:  actorName,
		Action:     "user_delete",
		TargetType: "user",
		TargetID:   targetID,
		TargetName: targetName,
		Detail:     fmt.Sprintf(`{"username":"%s"}`, targetName),
	}
	if err := s.repo.Create(entry); err != nil {
		log.Error().Err(err).Msg("failed to write audit log for user delete")
	} else {
		s.indexAuditEntry(entry)
	}
}

func (s *Service) List(page, pageSize int) ([]AuditLog, int64, error) {
	return s.repo.List(page, pageSize)
}

func (s *Service) indexAuditEntry(entry *AuditLog) {
	if s.indexer != nil {
		s.indexer.IndexAuditLog(entry.ID, entry.ActorName, entry.Action, entry.TargetName, entry.Detail, entry.CreatedAt)
	}
}