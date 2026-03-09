package campaign

import (
	"fmt"
	"strings"
)

type Service struct {
	repo *Repository
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) List(userID uint64, page, pageSize int) ([]CampaignListItem, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	return s.repo.FindAllByUserID(userID, page, pageSize)
}

func (s *Service) ListAll(page, pageSize int) ([]CampaignListItem, int64, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	return s.repo.FindAll(page, pageSize)
}

func (s *Service) GetByID(id uint64) (*Campaign, error) {
	return s.repo.FindByID(id)
}

func (s *Service) Create(c *Campaign) error {
	if c.Name == "" {
		return fmt.Errorf("campaign name is required")
	}
	if c.Subject == "" {
		return fmt.Errorf("campaign subject is required")
	}
	if c.FromEmail == "" {
		return fmt.Errorf("from email is required")
	}
	if c.BodyType == "" {
		c.BodyType = "html"
	}
	if c.Status == "" {
		c.Status = "draft"
	}
	if c.RateLimit == 0 {
		c.RateLimit = 2
	}
	return s.repo.Create(c)
}

func (s *Service) Update(c *Campaign) error {
	return s.repo.Update(c)
}

func (s *Service) Delete(id uint64) error {
	return s.repo.Delete(id)
}

// RenderTemplate replaces {{variable}} placeholders in template text with the provided values.
func RenderTemplate(template string, variables map[string]string) string {
	result := template
	for key, val := range variables {
		placeholder := "{{" + key + "}}"
		result = strings.ReplaceAll(result, placeholder, val)
	}
	return result
}
