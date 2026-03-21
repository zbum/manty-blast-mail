package recipient

import (
	"io"
	"strings"
	"unicode/utf8"

	"golang.org/x/text/encoding"
	"golang.org/x/text/encoding/charmap"
	"golang.org/x/text/encoding/japanese"
	"golang.org/x/text/encoding/korean"
	"golang.org/x/text/encoding/simplifiedchinese"
	"golang.org/x/text/encoding/traditionalchinese"
	"golang.org/x/text/transform"
)

var encodingMap = map[string]encoding.Encoding{
	"euc-kr":       korean.EUCKR,
	"shift_jis":    japanese.ShiftJIS,
	"shift-jis":    japanese.ShiftJIS,
	"windows-1252": charmap.Windows1252,
	"iso-8859-1":   charmap.ISO8859_1,
	"big5":         traditionalchinese.Big5,
	"gbk":          simplifiedchinese.GBK,
}

// SupportedEncodings returns the list of supported encoding names.
func SupportedEncodings() []string {
	return []string{
		"utf-8",
		"euc-kr",
		"shift_jis",
		"shift-jis",
		"windows-1252",
		"iso-8859-1",
		"big5",
		"gbk",
	}
}

// DetectAndConvert detects the encoding of data and converts it to UTF-8.
// If manualEncoding is set and not "utf-8", it decodes using that encoding.
// Otherwise it checks if data is valid UTF-8, and if not, tries common encodings.
func DetectAndConvert(data []byte, manualEncoding string) ([]byte, error) {
	// Strip UTF-8 BOM (EF BB BF) if present
	if len(data) >= 3 && data[0] == 0xEF && data[1] == 0xBB && data[2] == 0xBF {
		data = data[3:]
	}

	// If manual encoding is set and not utf-8, decode using that encoding
	if manualEncoding != "" && strings.ToLower(manualEncoding) != "utf-8" {
		enc, ok := encodingMap[strings.ToLower(manualEncoding)]
		if !ok {
			return data, nil
		}
		reader := transform.NewReader(strings.NewReader(string(data)), enc.NewDecoder())
		decoded, err := io.ReadAll(reader)
		if err != nil {
			return nil, err
		}
		return decoded, nil
	}

	// If data is valid UTF-8, return as-is
	if utf8.Valid(data) {
		return data, nil
	}

	// Try common encodings in order
	tryEncodings := []encoding.Encoding{
		korean.EUCKR,
		charmap.Windows1252,
		japanese.ShiftJIS,
		charmap.ISO8859_1,
	}

	for _, enc := range tryEncodings {
		reader := transform.NewReader(strings.NewReader(string(data)), enc.NewDecoder())
		decoded, err := io.ReadAll(reader)
		if err != nil {
			continue
		}
		if utf8.Valid(decoded) {
			return decoded, nil
		}
	}

	// Fallback: return data as-is
	return data, nil
}
