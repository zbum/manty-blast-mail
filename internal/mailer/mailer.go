package mailer

import (
	"crypto/tls"
	"fmt"
	"net"
	"net/smtp"
	"sync"
	"time"

	"mail-sender/internal/config"
)

type Mailer struct {
	cfg  config.SMTPConfig
	pool chan *smtp.Client
	mu   sync.Mutex
}

func New(cfg config.SMTPConfig) *Mailer {
	m := &Mailer{
		cfg:  cfg,
		pool: make(chan *smtp.Client, cfg.PoolSize),
	}
	return m
}

func (m *Mailer) getClient() (*smtp.Client, error) {
	select {
	case c := <-m.pool:
		// Test if connection is still alive
		if err := c.Noop(); err == nil {
			return c, nil
		}
		c.Close()
	default:
	}
	return m.dial()
}

func (m *Mailer) putClient(c *smtp.Client) {
	select {
	case m.pool <- c:
	default:
		c.Close()
	}
}

func (m *Mailer) dial() (*smtp.Client, error) {
	addr := fmt.Sprintf("%s:%d", m.cfg.Host, m.cfg.Port)
	tlsCfg := &tls.Config{ServerName: m.cfg.Host}

	var conn net.Conn
	var err error

	if m.cfg.Port == 465 {
		// Port 465: implicit TLS (SMTPS) — connect with TLS from the start
		dialer := &net.Dialer{Timeout: 10 * time.Second}
		conn, err = tls.DialWithDialer(dialer, "tcp", addr, tlsCfg)
	} else {
		// Port 25/587: plain TCP, then upgrade via STARTTLS
		conn, err = net.DialTimeout("tcp", addr, 10*time.Second)
	}
	if err != nil {
		return nil, fmt.Errorf("dial smtp: %w", err)
	}

	c, err := smtp.NewClient(conn, m.cfg.Host)
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("smtp client: %w", err)
	}

	// STARTTLS for non-465 ports
	if m.cfg.Port != 465 {
		if ok, _ := c.Extension("STARTTLS"); ok {
			if err := c.StartTLS(tlsCfg); err != nil {
				c.Close()
				return nil, fmt.Errorf("starttls: %w", err)
			}
		}
	}

	// Auth if credentials provided
	if m.cfg.Username != "" {
		auth := smtp.PlainAuth("", m.cfg.Username, m.cfg.Password, m.cfg.Host)
		if err := c.Auth(auth); err != nil {
			c.Close()
			return nil, fmt.Errorf("smtp auth: %w", err)
		}
	}

	return c, nil
}

// Send sends an email message. Returns SMTP response string and error.
func (m *Mailer) Send(from string, to string, msg []byte) (string, error) {
	c, err := m.getClient()
	if err != nil {
		return "", err
	}

	if err := c.Mail(from); err != nil {
		c.Close()
		return "", fmt.Errorf("MAIL FROM: %w", err)
	}
	if err := c.Rcpt(to); err != nil {
		c.Reset()
		m.putClient(c)
		return "", fmt.Errorf("RCPT TO: %w", err)
	}

	w, err := c.Data()
	if err != nil {
		c.Reset()
		m.putClient(c)
		return "", fmt.Errorf("DATA: %w", err)
	}
	if _, err := w.Write(msg); err != nil {
		c.Reset()
		m.putClient(c)
		return "", fmt.Errorf("write data: %w", err)
	}
	if err := w.Close(); err != nil {
		c.Reset()
		m.putClient(c)
		return "", fmt.Errorf("close data: %w", err)
	}

	c.Reset()
	m.putClient(c)
	return "250 OK", nil
}

func (m *Mailer) Close() {
	close(m.pool)
	for c := range m.pool {
		c.Close()
	}
}
