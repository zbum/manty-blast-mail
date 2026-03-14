package main

import (
	"flag"
	"os"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/mysql"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"

	"github.com/zbum/manty-blast-mail/internal/audit"
	"github.com/zbum/manty-blast-mail/internal/auth"
	"github.com/zbum/manty-blast-mail/internal/campaign"
	"github.com/zbum/manty-blast-mail/internal/config"
	"github.com/zbum/manty-blast-mail/internal/crypto"
	"github.com/zbum/manty-blast-mail/internal/recipient"
	"github.com/zbum/manty-blast-mail/internal/search"
	"github.com/zbum/manty-blast-mail/internal/sender"
	"github.com/zbum/manty-blast-mail/internal/server"
)

func migrateRecipientEncryption(db *gorm.DB) {
	const batchSize = 500
	var offset int
	var migrated int

	for {
		var recipients []recipient.Recipient
		if err := db.Order("id ASC").Offset(offset).Limit(batchSize).Find(&recipients).Error; err != nil {
			log.Error().Err(err).Msg("failed to load recipients for encryption migration")
			return
		}
		if len(recipients) == 0 {
			break
		}

		for _, r := range recipients {
			needsMigration := false
			if r.Email != "" && !crypto.IsEncrypted(r.Email) {
				needsMigration = true
			}
			if r.Name != "" && !crypto.IsEncrypted(r.Name) {
				needsMigration = true
			}
			if !needsMigration {
				continue
			}

			encEmail, err := crypto.Encrypt(r.Email)
			if err != nil {
				log.Error().Err(err).Uint64("id", r.ID).Msg("failed to encrypt email")
				continue
			}
			encName, err := crypto.Encrypt(r.Name)
			if err != nil {
				log.Error().Err(err).Uint64("id", r.ID).Msg("failed to encrypt name")
				continue
			}

			db.Model(&recipient.Recipient{}).Where("id = ?", r.ID).Updates(map[string]interface{}{
				"email": encEmail,
				"name":  encName,
			})
			migrated++
		}

		offset += len(recipients)
		if len(recipients) < batchSize {
			break
		}
	}

	if migrated > 0 {
		log.Info().Int("count", migrated).Msg("migrated plaintext recipients to encrypted")
	}
}

func main() {
	configPath := flag.String("config", "config.yaml", "path to config file")
	flag.Parse()

	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr})

	cfg, err := config.Load(*configPath)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to load config")
	}

	var dialector gorm.Dialector
	switch cfg.Database.Driver {
	case "sqlite":
		dialector = sqlite.Open(cfg.Database.DSN())
	default:
		dialector = mysql.Open(cfg.Database.DSN())
	}

	db, err := gorm.Open(dialector, &gorm.Config{})
	if err != nil {
		log.Fatal().Err(err).Msg("failed to connect to database")
	}
	log.Info().Str("driver", cfg.Database.Driver).Msg("database connected")

	if err := db.AutoMigrate(
		&auth.User{},
		&campaign.Campaign{},
		&recipient.Recipient{},
		&sender.SendLogEntry{},
		&audit.AuditLog{},
	); err != nil {
		log.Fatal().Err(err).Msg("failed to auto-migrate database")
	}
	log.Info().Msg("database migration completed")

	// Initialize encryption for recipient data
	if cfg.Server.EncryptionKey != "" {
		if err := crypto.Init(cfg.Server.EncryptionKey); err != nil {
			log.Fatal().Err(err).Msg("failed to initialize encryption")
		}
		log.Info().Msg("recipient data encryption enabled")
	} else {
		log.Warn().Msg("ENCRYPTION_KEY not set, recipient data will not be encrypted")
	}

	var count int64
	db.Model(&auth.User{}).Count(&count)
	if count == 0 {
		hashed, err := bcrypt.GenerateFromPassword([]byte("admin"), bcrypt.DefaultCost)
		if err != nil {
			log.Fatal().Err(err).Msg("failed to hash default admin password")
		}
		db.Create(&auth.User{Username: "admin", Password: string(hashed), Role: "admin"})
		log.Info().Msg("default admin user created (username: admin, password: admin)")
	} else {
		// Ensure existing admin user has admin role
		db.Model(&auth.User{}).Where("username = ? AND (role = '' OR role = 'user')", "admin").Update("role", "admin")
	}

	// Migrate plaintext recipient data to encrypted
	if crypto.Enabled() {
		migrateRecipientEncryption(db)
	}

	// Recover campaigns stuck in "sending" status from previous crash
	var stuckCount int64
	db.Model(&campaign.Campaign{}).Where("status = ?", "sending").Count(&stuckCount)
	if stuckCount > 0 {
		db.Model(&campaign.Campaign{}).Where("status = ?", "sending").Update("status", "paused")
		log.Warn().Int64("count", stuckCount).Msg("recovered stuck campaigns from 'sending' to 'paused'")
	}

	// Initialize Bleve search index
	indexer, err := search.NewIndexer("bleve.index", db)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to create search index")
	}
	defer indexer.Close()
	indexer.Sync()

	srv := server.New(cfg, db, indexer)
	if err := srv.Start(); err != nil {
		log.Fatal().Err(err).Msg("server failed")
	}
}
