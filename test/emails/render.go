// Sjekker e-postmalene i supabase/templates med Go sine maler, slik Supabase Auth bruker dem:
// at de kan tolkes, og at de gir norsk som standard (også når språket mangler) og engelsk med lang = "en".
// Kjøres i CI: go run test/emails/render.go
package main

import (
	"bytes"
	"fmt"
	"html/template"
	"os"
	"path/filepath"
	"strings"
)

type data struct {
	ConfirmationURL, Email, NewEmail, SiteURL, Token, TokenHash, RedirectTo string
	Data                                                                     map[string]any
}

func main() {
	files, _ := filepath.Glob("supabase/templates/*.html")
	if len(files) == 0 {
		fmt.Println("FAIL: fant ingen maler")
		os.Exit(1)
	}
	failed := false
	cases := []struct {
		name string
		meta map[string]any
		want string
		lang string
	}{
		{"uten språk", map[string]any{}, "Hei", `lang="no"`},
		{"uten metadata", nil, "Hei", `lang="no"`},
		{"norsk", map[string]any{"lang": "no"}, "Hei", `lang="no"`},
		{"engelsk", map[string]any{"lang": "en", "display_name": "Kari"}, "Hi", `lang="en"`},
	}
	for _, f := range files {
		src, _ := os.ReadFile(f)
		t, err := template.New(filepath.Base(f)).Parse(string(src))
		if err != nil {
			fmt.Printf("FAIL %s: %v\n", f, err)
			failed = true
			continue
		}
		for _, c := range cases {
			var out bytes.Buffer
			d := data{ConfirmationURL: "https://arvklart.no/x", Email: "a@test.no", NewEmail: "b@test.no", Data: c.meta}
			if err := t.Execute(&out, d); err != nil {
				fmt.Printf("FAIL %s (%s): %v\n", f, c.name, err)
				failed = true
				continue
			}
			s := out.String()
			if !strings.Contains(s, c.want) || !strings.Contains(s, c.lang) || !strings.Contains(s, "https://arvklart.no/x") {
				fmt.Printf("FAIL %s (%s): mangler %q, %q eller lenken\n", f, c.name, c.want, c.lang)
				failed = true
				continue
			}
			fmt.Printf("OK   %s (%s)\n", filepath.Base(f), c.name)
		}
	}
	if failed {
		os.Exit(1)
	}
}
