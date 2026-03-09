package auth

import (
	"net/http"

	"github.com/gorilla/sessions"
)

const sessionName = "mail-sender-session"

type SessionStore struct {
	store *sessions.CookieStore
}

func NewSessionStore(secret string) *SessionStore {
	store := sessions.NewCookieStore([]byte(secret))
	store.Options = &sessions.Options{
		Path:     "/",
		MaxAge:   86400,
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
	}
	return &SessionStore{store: store}
}

func (s *SessionStore) Get(r *http.Request) (*sessions.Session, error) {
	return s.store.Get(r, sessionName)
}
