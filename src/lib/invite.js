// Ferdig invitasjonsmelding (norsk eller engelsk) med lenken. Ren funksjon, testes med node --test.
export function inviteMessage({ lang, name, email, estateName, url }) {
  return lang === 'en'
    ? `Hi ${name}! I have invited you to «${estateName}» in Arvklart, where we share out the belongings together. Open the link and log in or create an account with the email ${email}: ${url}`
    : `Hei ${name}! Jeg har invitert deg til «${estateName}» i Arvklart, der vi fordeler eiendelene sammen. Åpne lenken og logg inn eller opprett konto med e-posten ${email}: ${url}`
}
