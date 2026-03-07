package mailer

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	"net/textproto"
	"strings"
)

// writeQP writes data with quoted-printable encoding.
func writeQP(dst *bytes.Buffer, data []byte) {
	w := quotedprintable.NewWriter(dst)
	w.Write(data)
	w.Close()
}

// writeBase64Lines writes data as base64-encoded content wrapped at 76 chars per line.
func writeBase64Lines(dst *bytes.Buffer, data []byte) {
	encoded := base64.StdEncoding.EncodeToString(data)
	for i := 0; i < len(encoded); i += 76 {
		end := min(i+76, len(encoded))
		dst.WriteString(encoded[i:end])
		dst.WriteString("\r\n")
	}
}

// encodeHeader RFC 2047 encodes a header value if it contains non-ASCII characters.
func encodeHeader(value string) string {
	for _, r := range value {
		if r > 127 {
			return mime.BEncoding.Encode("UTF-8", value)
		}
	}
	return value
}

// formatEncodedAddress formats an email address with RFC 2047 encoded display name.
func formatEncodedAddress(email, name string) string {
	if name == "" {
		return email
	}
	return fmt.Sprintf("%s <%s>", encodeHeader(name), email)
}

// BuildHTMLMessage builds a MIME message matching standard calendar invitation format:
//
//	multipart/mixed
//	├── multipart/alternative
//	│   ├── text/html         (base64)
//	│   └── text/calendar     (quoted-printable, inline for email client calendar UI)
//	└── application/ics       (base64, attachment for .ics file download)
func BuildHTMLMessage(from, fromName, to, toName, subject, htmlBody, textBody string, icsContent string) ([]byte, error) {
	var buf bytes.Buffer

	fromAddr := formatEncodedAddress(from, fromName)
	toAddr := formatEncodedAddress(to, toName)
	encodedSubject := encodeHeader(subject)

	if icsContent == "" {
		altWriter := multipart.NewWriter(&buf)

		buf.Reset()
		fmt.Fprintf(&buf, "From: %s\r\n", fromAddr)
		fmt.Fprintf(&buf, "To: %s\r\n", toAddr)
		fmt.Fprintf(&buf, "Subject: %s\r\n", encodedSubject)
		fmt.Fprintf(&buf, "MIME-Version: 1.0\r\n")
		fmt.Fprintf(&buf, "Content-Type: multipart/alternative; boundary=%s\r\n", altWriter.Boundary())
		fmt.Fprintf(&buf, "\r\n")

		if err := writeHTMLPartB64(altWriter, htmlBody); err != nil {
			return nil, err
		}
		if err := altWriter.Close(); err != nil {
			return nil, fmt.Errorf("close alternative writer: %w", err)
		}
	} else {
		mixedWriter := multipart.NewWriter(&buf)

		buf.Reset()
		fmt.Fprintf(&buf, "From: %s\r\n", fromAddr)
		fmt.Fprintf(&buf, "To: %s\r\n", toAddr)
		fmt.Fprintf(&buf, "Subject: %s\r\n", encodedSubject)
		fmt.Fprintf(&buf, "MIME-Version: 1.0\r\n")
		fmt.Fprintf(&buf, "Content-Type: multipart/mixed;\r\n\tboundary=\"%s\"\r\n", mixedWriter.Boundary())
		fmt.Fprintf(&buf, "\r\n")

		// Build multipart/alternative (html + inline calendar)
		var altBuf bytes.Buffer
		altWriter := multipart.NewWriter(&altBuf)

		if err := writeHTMLPartB64(altWriter, htmlBody); err != nil {
			return nil, err
		}

		// Inline text/calendar (quoted-printable, like Dooray/Gmail)
		icsInlineHeader := make(textproto.MIMEHeader)
		icsInlineHeader.Set("Content-Type", "text/calendar; method=REQUEST; charset=UTF-8; component=VEVENT")
		icsInlineHeader.Set("Content-Transfer-Encoding", "quoted-printable")
		icsPart, err := altWriter.CreatePart(icsInlineHeader)
		if err != nil {
			return nil, fmt.Errorf("create inline calendar part: %w", err)
		}
		var icsQP bytes.Buffer
		writeQP(&icsQP, []byte(icsContent))
		if _, err := icsPart.Write(icsQP.Bytes()); err != nil {
			return nil, fmt.Errorf("write inline calendar part: %w", err)
		}

		if err := altWriter.Close(); err != nil {
			return nil, fmt.Errorf("close alternative writer: %w", err)
		}

		// Write alternative part into mixed
		altHeader := make(textproto.MIMEHeader)
		altHeader.Set("Content-Type", fmt.Sprintf("multipart/alternative;\r\n\tboundary=\"%s\"", altWriter.Boundary()))
		ap, err := mixedWriter.CreatePart(altHeader)
		if err != nil {
			return nil, fmt.Errorf("create alternative part: %w", err)
		}
		if _, err := ap.Write(altBuf.Bytes()); err != nil {
			return nil, fmt.Errorf("write alternative part: %w", err)
		}

		// .ics file attachment (base64)
		icsAttachHeader := make(textproto.MIMEHeader)
		icsAttachHeader.Set("Content-Type", "application/ics; name=meeting.ics")
		icsAttachHeader.Set("Content-Transfer-Encoding", "base64")
		icsAttachHeader.Set("Content-Disposition", "attachment; filename=meeting.ics")
		attachPart, err := mixedWriter.CreatePart(icsAttachHeader)
		if err != nil {
			return nil, fmt.Errorf("create ics attachment: %w", err)
		}
		var attachB64 bytes.Buffer
		writeBase64Lines(&attachB64, []byte(icsContent))
		if _, err := attachPart.Write(attachB64.Bytes()); err != nil {
			return nil, fmt.Errorf("write ics attachment: %w", err)
		}

		if err := mixedWriter.Close(); err != nil {
			return nil, fmt.Errorf("close mixed writer: %w", err)
		}
	}

	return buf.Bytes(), nil
}

// BuildRawMIMEMessage takes a raw MIME string, performs template variable
// substitution, and returns the result as bytes.
func BuildRawMIMEMessage(rawMIME string, vars map[string]string) ([]byte, error) {
	result := rawMIME
	for key, val := range vars {
		placeholder := "{{" + key + "}}"
		result = strings.ReplaceAll(result, placeholder, val)
	}
	return []byte(result), nil
}

func writeHTMLPartB64(w *multipart.Writer, html string) error {
	h := make(textproto.MIMEHeader)
	h.Set("Content-Type", "text/html; charset=utf-8")
	h.Set("Content-Transfer-Encoding", "base64")
	p, err := w.CreatePart(h)
	if err != nil {
		return fmt.Errorf("create html part: %w", err)
	}
	var buf bytes.Buffer
	writeBase64Lines(&buf, []byte(html))
	if _, err := p.Write(buf.Bytes()); err != nil {
		return fmt.Errorf("write html part: %w", err)
	}
	return nil
}
