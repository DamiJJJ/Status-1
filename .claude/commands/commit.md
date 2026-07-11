---
description: Generuje commit message dla bieżących zmian (nie commituje)
argument-hint: "[opcjonalna wskazówka, np. 'tylko zmiany w styles.css']"
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*), Read
---

## Kontekst

Status roboczy:
!`git status --short`

Zmiany w plikach śledzonych (staged + unstaged):
!`git diff HEAD --stat`

Pełny diff:
!`git diff HEAD`

Ostatnie commity (wzorzec stylu):
!`git log --format='%s%n%n%b%n---' -5`

## Zadanie

Wygeneruj **commit message** dla powyższych zmian. Dodatkowa wskazówka użytkownika (może być pusta): $ARGUMENTS

Jeśli w `git status` widać nieśledzone pliki istotne dla zmiany (`??`), przeczytaj je (Read) — diff ich nie pokazuje, a muszą trafić do opisu.

### Zasady

- **Nie commituj i nie stageuj niczego.** Twoim wynikiem jest sam tekst wiadomości — użytkownik commituje sam.
- Język wiadomości: **angielski** (sama odpowiedź/omówienie — po polsku). Bez prefiksów typu `feat:`/`fix:` (repo ich nie używa).
- Temat: jedna linia, ≤ 72 znaki, tryb rozkazujący („Add X", „Fix Y"), bez kropki na końcu.
- Body (tylko gdy zmiana jest nietrywialna): pusta linia, potem akapity zawijane na ~72 znakach. Opisz **co i dlaczego**, nie linijka-po-linijce. Wypunktowania `- ` gdy zmian jest kilka niezależnych.
- Jeśli zmiany są rozdzielne tematycznie (np. gameplay + branding + docs), **zaproponuj podział na osobne commity** — dla każdego osobny temat i body, plus lista plików/hunków, które do niego należą.
- Nie dopisuj `Co-Authored-By` ani żadnych stopek.

### Format odpowiedzi

Najpierw jedno zdanie podsumowania, co obejmują zmiany. Potem gotowa wiadomość (lub wiadomości) w bloku kodu — tak, żeby dało się ją skopiować w całości.
