package mailer

import (
	"bytes"
	"fmt"
	"regexp"
	"strings"
	"text/template"
)

// RenderTemplate renders a template string with the given data map.
// Template variables use Go text/template syntax: {{.Name}}, {{.Email}}, etc.
func RenderTemplate(templateStr string, data map[string]string) (string, error) {
	tmpl, err := template.New("email").Parse(templateStr)
	if err != nil {
		return "", fmt.Errorf("parse template: %w", err)
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return "", fmt.Errorf("execute template: %w", err)
	}

	return buf.String(), nil
}

// RenderBody renders an HTML body template and generates both HTML and plain text versions.
// The data map typically contains keys like "Name", "Email" and any custom variables.
func RenderBody(bodyHTML string, data map[string]string) (htmlResult string, textResult string, err error) {
	htmlResult, err = RenderTemplate(bodyHTML, data)
	if err != nil {
		return "", "", fmt.Errorf("render html body: %w", err)
	}

	textResult = stripHTMLTags(htmlResult)
	return htmlResult, textResult, nil
}

// stripHTMLTags removes HTML tags from a string and returns a plain text version.
func stripHTMLTags(html string) string {
	// Remove script and style blocks entirely
	reScript := regexp.MustCompile(`(?is)<script.*?>.*?</script>`)
	result := reScript.ReplaceAllString(html, "")
	reStyle := regexp.MustCompile(`(?is)<style.*?>.*?</style>`)
	result = reStyle.ReplaceAllString(result, "")

	// Replace <br>, <br/>, <br /> with newline
	reBr := regexp.MustCompile(`(?i)<br\s*/?>`)
	result = reBr.ReplaceAllString(result, "\n")

	// Replace closing block tags with newlines
	reBlock := regexp.MustCompile(`(?i)</(?:p|div|h[1-6]|li|tr)>`)
	result = reBlock.ReplaceAllString(result, "\n")

	// Remove all remaining HTML tags
	reTags := regexp.MustCompile(`<[^>]*>`)
	result = reTags.ReplaceAllString(result, "")

	// Decode common HTML entities
	result = strings.ReplaceAll(result, "&amp;", "&")
	result = strings.ReplaceAll(result, "&lt;", "<")
	result = strings.ReplaceAll(result, "&gt;", ">")
	result = strings.ReplaceAll(result, "&quot;", "\"")
	result = strings.ReplaceAll(result, "&#39;", "'")
	result = strings.ReplaceAll(result, "&nbsp;", " ")

	// Collapse multiple blank lines into a single blank line
	reBlank := regexp.MustCompile(`\n{3,}`)
	result = reBlank.ReplaceAllString(result, "\n\n")

	return strings.TrimSpace(result)
}
