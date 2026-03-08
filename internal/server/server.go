package server

import (
	"fmt"
	"io/fs"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/rs/zerolog/log"
	"gorm.io/gorm"

	mailsender "github.com/zbum/manty-blast-mail"
	"github.com/zbum/manty-blast-mail/internal/auth"
	"github.com/zbum/manty-blast-mail/internal/campaign"
	"github.com/zbum/manty-blast-mail/internal/config"
	"github.com/zbum/manty-blast-mail/internal/mailer"
	"github.com/zbum/manty-blast-mail/internal/recipient"
	"github.com/zbum/manty-blast-mail/internal/report"
	"github.com/zbum/manty-blast-mail/internal/sender"
	ws "github.com/zbum/manty-blast-mail/internal/websocket"
)

type Server struct {
	cfg    *config.Config
	db     *gorm.DB
	router *chi.Mux
}

func New(cfg *config.Config, db *gorm.DB) *Server {
	s := &Server{cfg: cfg, db: db}
	s.setupRoutes()
	return s
}

func (s *Server) setupRoutes() {
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.RealIP)

	// Auth
	sessionStore := auth.NewSessionStore(s.cfg.Server.SessionSecret)
	authHandler := auth.NewHandler(s.db, sessionStore)
	authMiddleware := auth.NewMiddleware(sessionStore)

	// Services
	hub := ws.NewHub()
	go hub.Run()

	ml := mailer.New(s.cfg.SMTP)
	sendService := sender.NewService(s.db, ml, hub, s.cfg.Sender)

	campaignHandler := campaign.NewHandler(s.db, ml)
	recipientHandler := recipient.NewHandler(s.db)
	reportHandler := report.NewHandler(s.db)
	wsHandler := ws.NewHandler(hub, sendService)

	// Health check
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	// API routes
	r.Route("/api/v1", func(r chi.Router) {
		// Auth (public)
		r.Post("/auth/login", authHandler.Login)

		// Protected routes
		r.Group(func(r chi.Router) {
			r.Use(authMiddleware.RequireAuth)

			r.Post("/auth/logout", authHandler.Logout)
			r.Get("/auth/me", authHandler.Me)
			r.Post("/auth/users", authHandler.CreateUser)
			r.Put("/auth/password", authHandler.ChangePassword)

			// Campaigns
			r.Get("/campaigns", campaignHandler.List)
			r.Post("/campaigns", campaignHandler.Create)
			r.Get("/campaigns/{id}", campaignHandler.Get)
			r.Put("/campaigns/{id}", campaignHandler.Update)
			r.Delete("/campaigns/{id}", campaignHandler.Delete)

			// Recipients
			r.Post("/campaigns/{id}/recipients/upload", recipientHandler.Upload)
			r.Post("/campaigns/{id}/recipients/manual", recipientHandler.Manual)
			r.Get("/campaigns/{id}/recipients", recipientHandler.List)
			r.Delete("/campaigns/{id}/recipients", recipientHandler.DeleteAll)

			// Preview
			r.Post("/campaigns/{id}/preview", campaignHandler.Preview)
			r.Post("/campaigns/{id}/preview/send", campaignHandler.PreviewSend)
			r.Post("/campaigns/{id}/reset", campaignHandler.ResetToDraft)

			// Send control
			r.Post("/campaigns/{id}/send/start", sendService.HandleStart)
			r.Post("/campaigns/{id}/send/pause", sendService.HandlePause)
			r.Post("/campaigns/{id}/send/resume", sendService.HandleResume)
			r.Post("/campaigns/{id}/send/cancel", sendService.HandleCancel)
			r.Put("/campaigns/{id}/send/rate", sendService.HandleSetRate)

			// Reports
			r.Get("/campaigns/{id}/logs", reportHandler.Logs)
			r.Get("/campaigns/{id}/report/export", reportHandler.Export)
			r.Get("/dashboard", reportHandler.Dashboard)
		})
	})

	// WebSocket
	r.Get("/ws", wsHandler.ServeWS)

	// SPA static files
	distFS, err := fs.Sub(mailsender.WebAssets, "web/dist")
	if err != nil {
		log.Warn().Err(err).Msg("web/dist not found, SPA will not be served")
	} else {
		fileServer := http.FileServer(http.FS(distFS))
		r.Get("/*", func(w http.ResponseWriter, r *http.Request) {
			// Try to serve the file; if not found, serve index.html for SPA routing
			f, err := distFS.Open(r.URL.Path[1:])
			if err != nil {
				// Serve index.html for SPA client-side routing
				indexFile, err2 := fs.ReadFile(distFS, "index.html")
				if err2 != nil {
					http.NotFound(w, r)
					return
				}
				w.Header().Set("Content-Type", "text/html; charset=utf-8")
				w.Write(indexFile)
				return
			}
			f.Close()
			fileServer.ServeHTTP(w, r)
		})
	}

	s.router = r
}

func (s *Server) Start() error {
	addr := fmt.Sprintf(":%d", s.cfg.Server.Port)
	log.Info().Str("addr", addr).Msg("starting server")
	return http.ListenAndServe(addr, s.router)
}
