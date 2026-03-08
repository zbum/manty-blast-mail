package main

import (
	"flag"
	"os"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"gorm.io/driver/mysql"
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

	db, err := gorm.Open(mysql.Open(cfg.Database.DSN()), &gorm.Config{})
	if err != nil {
		log.Fatal().Err(err).Msg("failed to connect to database")
	}

	if err := db.AutoMigrate(
		&auth.User{},
		&campaign.Campaign{},
		&recipient.Recipient{},
		&sender.SendLogEntry{},
	); err != nil {
		log.Fatal().Err(err).Msg("failed to auto-migrate database")
	}
	log.Info().Msg("database migration completed")

	srv := server.New(cfg, db)
	if err := srv.Start(); err != nil {
		log.Fatal().Err(err).Msg("server failed")
	}
}
