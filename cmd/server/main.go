package main

import (
	"flag"
	"os"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/mysql"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"github.com/zbum/manty-blast-mail/internal/auth"
	"github.com/zbum/manty-blast-mail/internal/campaign"
	"github.com/zbum/manty-blast-mail/internal/config"
	"github.com/zbum/manty-blast-mail/internal/recipient"
	"github.com/zbum/manty-blast-mail/internal/sender"
	"github.com/zbum/manty-blast-mail/internal/server"
)

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
	); err != nil {
		log.Fatal().Err(err).Msg("failed to auto-migrate database")
	}
	log.Info().Msg("database migration completed")

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

	// Recover campaigns stuck in "sending" status from previous crash
	var stuckCount int64
	db.Model(&campaign.Campaign{}).Where("status = ?", "sending").Count(&stuckCount)
	if stuckCount > 0 {
		db.Model(&campaign.Campaign{}).Where("status = ?", "sending").Update("status", "paused")
		log.Warn().Int64("count", stuckCount).Msg("recovered stuck campaigns from 'sending' to 'paused'")
	}

	srv := server.New(cfg, db)
	if err := srv.Start(); err != nil {
		log.Fatal().Err(err).Msg("server failed")
	}
}
