package auth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"golang.org/x/oauth2"
	"gorm.io/gorm"

	"github.com/zbum/manty-blast-mail/internal/config"
)

type OAuthHandler struct {
	db           *gorm.DB
	sessionStore *SessionStore
	oauthConfig  *oauth2.Config
	userInfoURL  string
	enabled      bool
}

func NewOAuthHandler(db *gorm.DB, sessionStore *SessionStore, cfg config.OAuthConfig) *OAuthHandler {
	if !cfg.Enabled || cfg.ClientID == "" {
		return &OAuthHandler{enabled: false}
	}

	scopes := cfg.Scopes
	if len(scopes) == 0 {
		scopes = []string{"openid", "profile", "email"}
	}

	oauthCfg := &oauth2.Config{
		ClientID:     cfg.ClientID,
		ClientSecret: cfg.ClientSecret,
		Endpoint: oauth2.Endpoint{
			AuthURL:  cfg.AuthURL,
			TokenURL: cfg.TokenURL,
		},
		RedirectURL: cfg.RedirectURL,
		Scopes:      scopes,
	}

	return &OAuthHandler{
		db:           db,
		sessionStore: sessionStore,
		oauthConfig:  oauthCfg,
		userInfoURL:  cfg.UserInfoURL,
		enabled:      true,
	}
}

func (h *OAuthHandler) IsEnabled() bool {
	return h.enabled
}

func (h *OAuthHandler) HandleAuthInfo(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"oauth_enabled": h.enabled,
	})
}

func (h *OAuthHandler) HandleRedirect(w http.ResponseWriter, r *http.Request) {
	if !h.enabled {
		http.Error(w, `{"error":"oauth not configured"}`, http.StatusNotFound)
		return
	}

	state, err := generateState()
	if err != nil {
		http.Error(w, `{"error":"failed to generate state"}`, http.StatusInternalServerError)
		return
	}

	session, err := h.sessionStore.Get(r)
	if err != nil {
		http.Error(w, `{"error":"session error"}`, http.StatusInternalServerError)
		return
	}
	session.Values["oauth_state"] = state
	if err := session.Save(r, w); err != nil {
		http.Error(w, `{"error":"failed to save session"}`, http.StatusInternalServerError)
		return
	}

	url := h.oauthConfig.AuthCodeURL(state)
	http.Redirect(w, r, url, http.StatusTemporaryRedirect)
}

type oauthUserInfo struct {
	ID       string `json:"sub"`
	Email    string `json:"email"`
	Name     string `json:"name"`
	Username string `json:"preferred_username"`
}

func (h *OAuthHandler) HandleCallback(w http.ResponseWriter, r *http.Request) {
	if !h.enabled {
		http.Error(w, `{"error":"oauth not configured"}`, http.StatusNotFound)
		return
	}

	session, err := h.sessionStore.Get(r)
	if err != nil {
		http.Error(w, `{"error":"session error"}`, http.StatusInternalServerError)
		return
	}

	savedState, ok := session.Values["oauth_state"].(string)
	if !ok || savedState == "" {
		http.Error(w, `{"error":"invalid oauth state"}`, http.StatusBadRequest)
		return
	}
	delete(session.Values, "oauth_state")

	state := r.URL.Query().Get("state")
	if state != savedState {
		http.Error(w, `{"error":"state mismatch"}`, http.StatusBadRequest)
		return
	}

	code := r.URL.Query().Get("code")
	if code == "" {
		http.Error(w, `{"error":"missing authorization code"}`, http.StatusBadRequest)
		return
	}

	token, err := h.oauthConfig.Exchange(context.Background(), code)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"token exchange failed: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	userInfo, err := h.fetchUserInfo(token)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"failed to get user info: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	username := userInfo.Username
	if username == "" {
		username = userInfo.Email
	}
	if username == "" {
		username = userInfo.ID
	}

	user, err := h.findOrCreateOAuthUser(username)
	if err != nil {
		http.Error(w, `{"error":"failed to create user"}`, http.StatusInternalServerError)
		return
	}

	session.Values["user_id"] = user.ID
	session.Values["user_role"] = user.Role
	if err := session.Save(r, w); err != nil {
		http.Error(w, `{"error":"failed to save session"}`, http.StatusInternalServerError)
		return
	}

	http.Redirect(w, r, "/", http.StatusTemporaryRedirect)
}

func (h *OAuthHandler) fetchUserInfo(token *oauth2.Token) (*oauthUserInfo, error) {
	client := h.oauthConfig.Client(context.Background(), token)
	resp, err := client.Get(h.userInfoURL)
	if err != nil {
		return nil, fmt.Errorf("userinfo request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read userinfo body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("userinfo returned %d: %s", resp.StatusCode, string(body))
	}

	var info oauthUserInfo
	if err := json.Unmarshal(body, &info); err != nil {
		return nil, fmt.Errorf("parse userinfo: %w", err)
	}

	return &info, nil
}

func (h *OAuthHandler) findOrCreateOAuthUser(username string) (*User, error) {
	var user User
	err := h.db.Where("username = ?", username).First(&user).Error
	if err == nil {
		return &user, nil
	}
	if err != gorm.ErrRecordNotFound {
		return nil, err
	}

	user = User{
		Username: username,
		Password: "", // OAuth users have no local password
		Role:     "pending",
		AuthType: "oauth",
	}
	if err := h.db.Create(&user).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

func generateState() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.URLEncoding.EncodeToString(b), nil
}
