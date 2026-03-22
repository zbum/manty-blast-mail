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
	"github.com/zbum/manty-blast-mail/internal/attachment"
	"github.com/zbum/manty-blast-mail/internal/audit"
	"github.com/zbum/manty-blast-mail/internal/auth"
	"github.com/zbum/manty-blast-mail/internal/campaign"
	"github.com/zbum/manty-blast-mail/internal/config"
	"github.com/zbum/manty-blast-mail/internal/mailer"
	"github.com/zbum/manty-blast-mail/internal/recipient"
	"github.com/zbum/manty-blast-mail/internal/report"
	"github.com/zbum/manty-blast-mail/internal/search"
	"github.com/zbum/manty-blast-mail/internal/sender"
	ws "github.com/zbum/manty-blast-mail/internal/websocket"
)

type Server struct {
	cfg     *config.Config
	db      *gorm.DB
	router  *chi.Mux
	indexer *search.Indexer
}

func New(cfg *config.Config, db *gorm.DB, indexer *search.Indexer) *Server {
	s := &Server{cfg: cfg, db: db, indexer: indexer}
	s.setupRoutes()
	return s
}

func (s *Server) setupRoutes() {
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.RealIP)

	// Audit
	auditService := audit.NewService(s.db, s.indexer)
	auditHandler := audit.NewHandler(auditService)

	// Auth
	sessionStore := auth.NewSessionStore(s.cfg.Server.SessionSecret)
	authHandler := auth.NewHandler(s.db, sessionStore, auditService)
	authMiddleware := auth.NewMiddleware(sessionStore)
	oauthHandler := auth.NewOAuthHandler(s.db, sessionStore, s.cfg.OAuth)

	// Services
	hub := ws.NewHub()
	go hub.Run()

	ml := mailer.New(s.cfg.SMTP)
	sendService := sender.NewService(s.db, ml, hub, s.cfg.Sender, auditService)
	sendService.StartScheduler()

	campaignHandler := campaign.NewHandler(s.db, ml, s.indexer, s.cfg.Limits)
	attachmentHandler := attachment.NewHandler(s.db, s.cfg.Limits, "./data/attachments")
	recipientHandler := recipient.NewHandler(s.db, s.indexer)
	reportHandler := report.NewHandler(s.db)
	searchHandler := search.NewHandler(s.indexer)
	wsHandler := ws.NewHandler(hub, sendService)

	// Health check
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	// API routes
	r.Route("/api/v1", func(r chi.Router) {
		// Auth (public)
		r.Get("/auth/info", oauthHandler.HandleAuthInfo)
		r.Post("/auth/login", authHandler.Login)
		r.Get("/auth/oauth/redirect", oauthHandler.HandleRedirect)
		r.Get("/auth/oauth/callback", oauthHandler.HandleCallback)

		// Authenticated routes (pending users can access)
		r.Group(func(r chi.Router) {
			r.Use(authMiddleware.RequireAuth)

			r.Post("/auth/logout", authHandler.Logout)
			r.Get("/auth/me", authHandler.Me)
		})

		// Approved routes (pending users blocked)
		r.Group(func(r chi.Router) {
			r.Use(authMiddleware.RequireAuth)
			r.Use(authMiddleware.RequireApproved)

			// User management (admin only, checked in handler)
			r.Post("/auth/users", authHandler.CreateUser)
			r.Get("/auth/users", authHandler.ListUsers)
			r.Delete("/auth/users/{userId}", authHandler.DeleteUser)
			r.Put("/auth/users/{userId}/role", authHandler.UpdateRole)
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
			r.Delete("/campaigns/{id}/recipients/{recipientId}", recipientHandler.Delete)

			// Attachments
			r.Post("/campaigns/{id}/attachments", attachmentHandler.Upload)
			r.Get("/campaigns/{id}/attachments", attachmentHandler.List)
			r.Delete("/campaigns/{id}/attachments/{attachmentId}", attachmentHandler.Delete)

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
			r.Post("/campaigns/{id}/send/schedule", sendService.HandleSchedule)
			r.Post("/campaigns/{id}/send/cancel-schedule", sendService.HandleCancelSchedule)

			// Reports
			r.Get("/campaigns/{id}/logs", reportHandler.Logs)
			r.Get("/campaigns/{id}/report/export", reportHandler.Export)
			r.Get("/dashboard", reportHandler.Dashboard)

			// Search
			r.Get("/search", searchHandler.Search)

			// Audit logs (admin only, checked in handler middleware)
			r.Get("/audit-logs", auditHandler.List)
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
