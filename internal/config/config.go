package config

import (
	"fmt"
	"os"
	"strconv"

	"gopkg.in/yaml.v3"
)

type LimitsConfig struct {
	MaxHTMLSize       int64 `yaml:"max_html_size"`
	MaxAttachmentSize int64 `yaml:"max_attachment_size"`
	MaxMIMESize       int64 `yaml:"max_mime_size"`
}

type Config struct {
	Server   ServerConfig   `yaml:"server"`
	Database DatabaseConfig `yaml:"database"`
	SMTP     SMTPConfig     `yaml:"smtp"`
	Sender   SenderConfig   `yaml:"sender"`
	OAuth    OAuthConfig    `yaml:"oauth"`
	Limits   LimitsConfig   `yaml:"limits"`
}

type OAuthConfig struct {
	Enabled      bool   `yaml:"enabled"`
	ClientID     string `yaml:"client_id"`
	ClientSecret string `yaml:"client_secret"`
	AuthURL      string `yaml:"auth_url"`
	TokenURL     string `yaml:"token_url"`
	UserInfoURL  string `yaml:"userinfo_url"`
	RedirectURL  string `yaml:"redirect_url"`
	Scopes       []string `yaml:"scopes"`
}

type ServerConfig struct {
	Port          int    `yaml:"port"`
	SessionSecret string `yaml:"session_secret"`
	EncryptionKey string `yaml:"encryption_key"`
}

type DatabaseConfig struct {
	Driver   string `yaml:"driver"` // "mysql" (default) or "sqlite"
	Host     string `yaml:"host"`
	Port     int    `yaml:"port"`
	User     string `yaml:"user"`
	Password string `yaml:"password"`
	Name     string `yaml:"name"`
}

func (d DatabaseConfig) DSN() string {
	if d.Driver == "sqlite" {
		if d.Name == "" {
			return "blast-mail.db"
		}
		return d.Name
	}
	return fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?charset=utf8mb4&parseTime=True&loc=Local",
		d.User, d.Password, d.Host, d.Port, d.Name)
}

type SMTPConfig struct {
	Host     string `yaml:"host"`
	Port     int    `yaml:"port"`
	Username string `yaml:"username"`
	Password string `yaml:"password"`
	PoolSize int    `yaml:"pool_size"`
}

type SenderConfig struct {
	DefaultRateLimit int `yaml:"default_rate_limit"`
	MaxRateLimit     int `yaml:"max_rate_limit"`
	WorkerCount      int `yaml:"worker_count"`
	BatchSize        int `yaml:"batch_size"`
}

func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config: %w", err)
	}

	cfg := &Config{}
	if err := yaml.Unmarshal(data, cfg); err != nil {
		return nil, fmt.Errorf("parse config: %w", err)
	}

	applyEnvOverrides(cfg)

	if cfg.Database.Driver == "" {
		cfg.Database.Driver = "mysql"
	}
	if cfg.Server.Port == 0 {
		cfg.Server.Port = 8080
	}
	if cfg.SMTP.PoolSize == 0 {
		cfg.SMTP.PoolSize = 10
	}
	if cfg.Sender.DefaultRateLimit == 0 {
		cfg.Sender.DefaultRateLimit = 2
	}
	if cfg.Sender.MaxRateLimit == 0 {
		cfg.Sender.MaxRateLimit = 100
	}
	if cfg.Sender.WorkerCount == 0 {
		cfg.Sender.WorkerCount = 5
	}
	if cfg.Sender.BatchSize == 0 {
		cfg.Sender.BatchSize = 100
	}
	if cfg.Limits.MaxHTMLSize == 0 {
		cfg.Limits.MaxHTMLSize = 1 << 20 // 1MB
	}
	if cfg.Limits.MaxAttachmentSize == 0 {
		cfg.Limits.MaxAttachmentSize = 5 << 20 // 5MB
	}
	if cfg.Limits.MaxMIMESize == 0 {
		cfg.Limits.MaxMIMESize = 20 << 20 // 20MB
	}

	return cfg, nil
}

func applyEnvOverrides(cfg *Config) {
	if v := os.Getenv("DB_DRIVER"); v != "" {
		cfg.Database.Driver = v
	}
	if v := os.Getenv("DB_HOST"); v != "" {
		cfg.Database.Host = v
	}
	if v := os.Getenv("DB_PORT"); v != "" {
		if p, err := strconv.Atoi(v); err == nil {
			cfg.Database.Port = p
		}
	}
	if v := os.Getenv("DB_USER"); v != "" {
		cfg.Database.User = v
	}
	if v := os.Getenv("DB_PASSWORD"); v != "" {
		cfg.Database.Password = v
	}
	if v := os.Getenv("DB_NAME"); v != "" {
		cfg.Database.Name = v
	}
	if v := os.Getenv("SMTP_HOST"); v != "" {
		cfg.SMTP.Host = v
	}
	if v := os.Getenv("SMTP_PORT"); v != "" {
		if p, err := strconv.Atoi(v); err == nil {
			cfg.SMTP.Port = p
		}
	}
	if v := os.Getenv("SMTP_USERNAME"); v != "" {
		cfg.SMTP.Username = v
	}
	if v := os.Getenv("SMTP_PASSWORD"); v != "" {
		cfg.SMTP.Password = v
	}
	if v := os.Getenv("SESSION_SECRET"); v != "" {
		cfg.Server.SessionSecret = v
	}
	if v := os.Getenv("OAUTH_CLIENT_ID"); v != "" {
		cfg.OAuth.ClientID = v
	}
	if v := os.Getenv("OAUTH_CLIENT_SECRET"); v != "" {
		cfg.OAuth.ClientSecret = v
	}
	if v := os.Getenv("ENCRYPTION_KEY"); v != "" {
		cfg.Server.EncryptionKey = v
	}
	if v := os.Getenv("PORT"); v != "" {
		if p, err := strconv.Atoi(v); err == nil {
			cfg.Server.Port = p
		}
	}
	if v := os.Getenv("MAX_HTML_SIZE"); v != "" {
		if p, err := strconv.ParseInt(v, 10, 64); err == nil {
			cfg.Limits.MaxHTMLSize = p
		}
	}
	if v := os.Getenv("MAX_ATTACHMENT_SIZE"); v != "" {
		if p, err := strconv.ParseInt(v, 10, 64); err == nil {
			cfg.Limits.MaxAttachmentSize = p
		}
	}
	if v := os.Getenv("MAX_MIME_SIZE"); v != "" {
		if p, err := strconv.ParseInt(v, 10, 64); err == nil {
			cfg.Limits.MaxMIMESize = p
		}
	}
}
