package recipient

import (
	"database/sql/driver"
	"encoding/json"
	"time"

	"github.com/zbum/manty-blast-mail/internal/crypto"
)

type Recipient struct {
	ID           uint64    `json:"id" gorm:"primaryKey"`
	CampaignID   uint64    `json:"campaign_id" gorm:"index:idx_recipients_campaign_status;index:idx_recipients_campaign_email;index:idx_recipients_campaign_name"`
	Email        string    `json:"email" gorm:"index:idx_recipients_campaign_email;type:varchar(512)"`
	Name         string    `json:"name" gorm:"index:idx_recipients_campaign_name;type:varchar(512)"`
	Variables    JSONMap   `json:"variables" gorm:"type:json"`
	Status       string    `json:"status" gorm:"type:varchar(20);default:'pending';index:idx_recipients_campaign_status"`
	ErrorMessage string    `json:"error_message,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

func (r *Recipient) EncryptFields() error {
	var err error
	if r.Email, err = crypto.Encrypt(r.Email); err != nil {
		return err
	}
	if r.Name, err = crypto.Encrypt(r.Name); err != nil {
		return err
	}
	return nil
}

func (r *Recipient) DecryptFields() {
	if decrypted, err := crypto.Decrypt(r.Email); err == nil {
		r.Email = decrypted
	}
	if decrypted, err := crypto.Decrypt(r.Name); err == nil {
		r.Name = decrypted
	}
}

func DecryptRecipients(recipients []Recipient) {
	for i := range recipients {
		recipients[i].DecryptFields()
	}
}

type JSONMap map[string]string

func (j JSONMap) Value() (driver.Value, error) {
	if j == nil {
		return nil, nil
	}
	b, err := json.Marshal(j)
	return string(b), err
}

func (j *JSONMap) Scan(value interface{}) error {
	if value == nil {
		*j = nil
		return nil
	}
	var bytes []byte
	switch v := value.(type) {
	case string:
		bytes = []byte(v)
	case []byte:
		bytes = v
	}
	return json.Unmarshal(bytes, j)
}
