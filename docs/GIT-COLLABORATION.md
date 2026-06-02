# Git Collaboration Guide

A practical, no-fluff reference for working with teammates on this project. Read it once end-to-end, then skim individual sections as you need them.

---

## Table of contents

1. [The mental model](#1-the-mental-model)
2. [The Golden Rule](#2-the-golden-rule)
3. [One-time setup](#3-one-time-setup)
4. [The 5 commands you'll use 95% of the time](#4-the-5-commands-youll-use-95-of-the-time)
5. [The daily workflow](#5-the-daily-workflow)
6. [What is "merge"?](#6-what-is-merge)
7. [What is a "conflict"?](#7-what-is-a-conflict)
8. [How to resolve a conflict in VS Code](#8-how-to-resolve-a-conflict-in-vs-code)
9. [How to AVOID conflicts in the first place](#9-how-to-avoid-conflicts-in-the-first-place)
10. [Pull Requests on GitHub](#10-pull-requests-on-github)
11. [Quick reference card](#11-quick-reference-card)
12. [Troubleshooting common errors](#12-troubleshooting-common-errors)
13. [Glossary](#13-glossary)

---

## 1. The mental model

Git is **not** like Google Docs. It is not real-time. There are **4 separate copies** of the code, and you have to manually move changes between them.

```
            GitHub (the remote — the official copy)
                       │
        ┌──────────────┼──────────────┐
        │              │              │
   Your laptop     P2's laptop     P3's laptop
   (local copy)    (local copy)    (local copy)
```

Two commands move code between laptops and GitHub:

- **`git pull`** — *download* the latest from GitHub onto your laptop
- **`git push`** — *upload* your changes from your laptop to GitHub

A teammate's changes do not appear on your machine until **you** `pull`. Your changes do not appear on theirs until **you** `push` **and they** `pull`.

---

## 2. The Golden Rule

> **NEVER push directly to `main`.**

`main` is the official, working version of the project. If three people all push to `main` simultaneously, the repo turns into spaghetti within a day. Instead, each person works on their own **branch** — a parallel timeline of changes.

```
main  ●────●────●────●────●  (sacred — only updated via Pull Requests)
       \         \
        \         ●●●  feat/p2-api          (P2's work in progress)
         ●●●●  feat/boypemt-schema          (your work in progress)
```

When your branch is ready, you open a **Pull Request (PR)** on GitHub. A teammate reviews it, clicks **Merge**, and your branch becomes part of `main`. Everyone else then pulls `main` and now has your work.

### Branch naming convention

```
feat/<yourname>-<short-task>     # new feature
fix/<yourname>-<short-bug>       # bug fix
docs/<yourname>-<short-topic>    # documentation only
chore/<yourname>-<short-task>    # config, tooling, scaffolding
```

Examples:
- `feat/boypemt-schema`
- `feat/p2-checkout-api`
- `fix/p3-cart-badge`
- `docs/boypemt-architecture`
- `chore/p2-env-cleanup`

---

## 3. One-time setup

### 3a. Owner (Boypemt) — add teammates as collaborators

On GitHub, in the `WebTechFinal` repo:

1. Click **Settings → Collaborators → Add people**
2. Type each teammate's GitHub username
3. Click **Add to repository**
4. They receive an email invitation — they accept it

### 3b. Each teammate — clone the repo

Once they accept the invitation, each teammate runs **once** on their laptop:

```bash
git clone https://github.com/Boypemt/WebTechFinal.git
cd WebTechFinal
npm install
cp .env.example .env       # then they fill in JWT_SECRET themselves
```

### 3c. Each teammate — set your Git identity (one time only, per laptop)

```bash
git config --global user.name "Your Full Name"
git config --global user.email "your_github_email@example.com"
```

This is what shows up as the author on every commit.

---

## 4. The 5 commands you'll use 95% of the time

| Command | What it does |
|---|---|
| `git pull origin main` | Download teammates' latest work from GitHub |
| `git checkout -b feat/myname-task` | Start a new branch off `main` |
| `git add .` | Stage all changed files for the next commit |
| `git commit -m "feat: short message"` | Save a snapshot with a message |
| `git push -u origin feat/myname-task` | Upload your branch to GitHub |

Two helpful "what's going on?" commands:

| Command | What it tells you |
|---|---|
| `git status` | What branch you're on, what files changed, what's staged |
| `git log --oneline -10` | The last 10 commits in compact form |

Run `git status` constantly. It's the safest command in Git — it never changes anything, it just tells you the truth.

---

## 5. The daily workflow

This is the rhythm. Memorize these **6 steps**.

```bash
# 1. Start fresh — get teammates' latest work from main
git checkout main
git pull origin main

# 2. Make your own branch for today's task
git checkout -b feat/boypemt-schema
#                  └─ feat/<yourname>-<short-task>

# 3. ...code, code, code...

# 4. Save your work — commit early and often
git add .
git commit -m "feat: add workshops table with capacity columns"

# 5. Push YOUR branch up to GitHub
git push -u origin feat/boypemt-schema

# 6. On GitHub.com:
#    → click "Compare & pull request" button
#    → fill in the description
#    → click "Create pull request"
#    → tag a teammate as reviewer
```

Then **wait**. The teammate opens the PR, reads your changes, clicks **Approve** then **Merge pull request** then **Confirm merge**. Now `main` has your changes.

Next time anyone sits down to code, they start at Step 1 — and step 1 pulls in everyone's merged work.

### Commit early, commit often

Don't try to do "the whole feature, then one big commit." That style is hard to review and dangerous to revert. Aim for:

```bash
git commit -m "feat: add workshops table"
# ...30 minutes of work...
git commit -m "feat: add max_capacity + current_bookings columns"
# ...20 minutes of work...
git commit -m "feat: add seed.js for 12 sample workshops"
git push
```

Three small commits beat one huge "WIP" commit, every time.

### Conventional Commits prefixes

Every commit message starts with one of these prefixes:

| Prefix | When to use |
|---|---|
| `feat:` | A new feature |
| `fix:` | A bug fix |
| `docs:` | Documentation only |
| `chore:` | Tooling, config, no production code change |
| `refactor:` | Code change that doesn't add a feature or fix a bug |
| `style:` | Whitespace, semicolons, formatting only |
| `test:` | Adding or fixing tests |

This convention scores you points on rubric category #1 (Version Control).

---

## 6. What is "merge"?

**Merge** = combine two branches' histories into one timeline.

When your `feat/boypemt-schema` branch is merged into `main`, Git stitches all your commits onto the end of `main`'s timeline. It's automatic — *unless* there is a conflict (next section).

---

## 7. What is a "conflict"?

A **conflict** happens when **two people edit the same line in the same file** before merging. Git cannot guess which version is right, so it asks you to decide.

**Example:**

You changed `server/app.js` line 12 to:
```js
app.use(express.json({ limit: '10kb' }));
```

P2 also changed `server/app.js` line 12 to:
```js
app.use(express.json({ limit: '20kb' }));
```

Both branches try to merge. Git inserts both versions, marked with `<<<<<<<`, `=======`, `>>>>>>>`:

```js
<<<<<<< HEAD (current change — main)
app.use(express.json({ limit: '10kb' }));
=======
app.use(express.json({ limit: '20kb' }));
>>>>>>> feat/p2-api (incoming change)
```

This is a *placeholder* — the file will not run until you delete the markers and pick a version.

---

## 8. How to resolve a conflict in VS Code

VS Code has a built-in conflict resolver. When it detects conflict markers, four blue buttons appear above the conflict:

| Button | What it does |
|---|---|
| **Accept Current Change** | Keep YOUR version, delete theirs |
| **Accept Incoming Change** | Keep THEIR version, delete yours |
| **Accept Both Changes** | Keep both versions stacked (you'll likely need to hand-edit afterwards) |
| **Compare Changes** | Open a side-by-side diff to inspect both |

After clicking the right button, the conflict markers disappear. Then:

```bash
git add .
git commit -m "fix: resolve merge conflict in app.js"
git push
```

The conflict is resolved. The PR can now merge.

**Tip:** if you accept "Both Changes," **always re-read the file** to make sure the result actually compiles. Sometimes both lines were trying to do the same thing two different ways, and stacking them produces broken code.

---

## 9. How to AVOID conflicts in the first place

The best way to fix conflicts is to **not create them**.

### 9a. Split work by file ownership

Each person owns specific folders/files. As long as you respect these boundaries, you'll almost never edit the same file at the same time.

| Person | Owns |
|---|---|
| Boypemt (Lead Architect) | `server/db/`, `server/services/`, `server/controllers/`, `.env`, `schema.sql` |
| P2 (Integration Engineer) | `server/routes/`, `js/cart.js`, `js/login.js`, `js/cart-utils.js` |
| P3 (UX Engineer) | `index.html`, `product.html`, `cart.html`, `css/styles.css`, `js/scripts.js` |

### 9b. Pull `main` before starting AND after every PR merge

A stale local copy is the #1 cause of conflicts. **Every time** a PR gets merged into `main`, everyone else should pull:

```bash
git checkout main
git pull origin main
```

### 9c. Keep branches small and short-lived

Don't let a branch live for 4 days with 30 file changes. Merge each feature back to `main` after one focused task is done. Small branches = small diffs = small conflict risk.

### 9d. Talk before you code

A 2-minute message in the group chat:

> "I'm about to edit `app.js` to add CORS — anyone else touching it right now?"

…prevents 30 minutes of conflict resolution. Communication beats Git tooling.

---

## 10. Pull Requests on GitHub

### 10a. Opening a PR

After you `git push -u origin feat/yourname-task`, GitHub.com will show a yellow banner:

> **feat/yourname-task** had recent pushes. **[Compare & pull request]**

Click that button. Then:

1. **Base:** `main` ← **Compare:** `feat/yourname-task` (this should be pre-filled)
2. **Title:** mirror your commit message — `feat: add workshops table with capacity columns`
3. **Description:** write it like a mini-architecture note (template below)
4. **Reviewers:** click the gear icon on the right → tag a teammate
5. Click **Create pull request**

### 10b. PR description template

Copy-paste this every time:

```markdown
## What
Adds the `workshops` table with `max_capacity` and `current_bookings` columns.

## Why
Foundation for the niche twist (capacity check) and Bonus A (concurrency).

## How to test
1. `git checkout feat/boypemt-schema`
2. `node server/db/seed.js`
3. Open `store.db` in SQLite Viewer
4. Verify 12 rows in `workshops` table with capacity values

## Checklist
- [ ] No hard-coded secrets
- [ ] All SQL uses `?` placeholders
- [ ] Tested locally — `npm run dev` boots cleanly
```

Graders skim your PR history during the demo. Good PR descriptions = visible evidence of professional collaboration = **Score 3 on rubric category #1** without needing to argue for it.

### 10c. Reviewing a teammate's PR

When you're tagged as a reviewer:

1. Open the PR on GitHub
2. Click the **Files changed** tab
3. Hover over any line → click the blue **+** to leave a comment
4. When done, click **Review changes** (top right) and pick:
   - **Comment** — feedback only, no decision
   - **Approve** — looks good, ready to merge
   - **Request changes** — needs fixes before merge
5. Click **Submit review**

### 10d. Merging the PR

After approval, the original author (or anyone with write access) clicks:

1. **Merge pull request**
2. **Confirm merge**
3. **Delete branch** (always click this — keeps the repo clean)

Then locally, every teammate runs:

```bash
git checkout main
git pull origin main
```

…to bring the merged changes into their laptop.

---

## 11. Quick reference card

Print this. Tape it to your monitor.

```
┌─ Start of session ─────────────────────────────────────────┐
│  git checkout main                                         │
│  git pull origin main                                      │
│  git checkout -b feat/myname-shorttask                     │
└────────────────────────────────────────────────────────────┘

┌─ During coding ────────────────────────────────────────────┐
│  git status              # what changed?                   │
│  git add .                                                 │
│  git commit -m "feat: short message"                       │
└────────────────────────────────────────────────────────────┘

┌─ End of session ───────────────────────────────────────────┐
│  git push -u origin feat/myname-shorttask                  │
│  # then open PR on github.com                              │
└────────────────────────────────────────────────────────────┘

┌─ After your PR is merged ──────────────────────────────────┐
│  git checkout main                                         │
│  git pull origin main                                      │
│  git branch -d feat/myname-shorttask    # delete locally   │
└────────────────────────────────────────────────────────────┘
```

---

## 12. Troubleshooting common errors

### "rejected — non-fast-forward"

```
! [rejected]        main -> main (non-fast-forward)
error: failed to push some refs to 'origin'
```

**Cause:** GitHub has commits you don't have locally.
**Fix:** Pull first, then push.

```bash
git pull origin main
git push
```

### "Please tell me who you are"

```
Author identity unknown
Please tell me who you are.
```

**Cause:** You haven't set your Git identity on this laptop.
**Fix:**

```bash
git config --global user.name "Your Full Name"
git config --global user.email "your_email@example.com"
```

### "remote origin already exists"

```
fatal: remote origin already exists.
```

**Cause:** You ran `git remote add origin ...` twice.
**Fix:** Update the URL instead.

```bash
git remote set-url origin https://github.com/Boypemt/WebTechFinal.git
```

### "you have unstaged changes"

```
error: Your local changes to the following files would be overwritten by checkout
```

**Cause:** You're trying to switch branches but have uncommitted changes.
**Fix (option 1)** — commit them first:

```bash
git add .
git commit -m "wip: save progress before switching"
git checkout main
```

**Fix (option 2)** — stash them (set aside temporarily):

```bash
git stash
git checkout main
# ...later, come back to them:
git checkout feat/yourbranch
git stash pop
```

### "Already up to date" but I just pushed?

That's normal — `git pull` only fetches commits that are NEW to your local repo. If you just pushed and then pulled, there's nothing new for you.

### "fatal: not a git repository"

**Cause:** You ran a `git` command outside a folder that contains `.git/`.
**Fix:** `cd` into your project folder first.

```bash
cd "C:\Users\ROG\Downloads\WebTechFinal"
```

### I committed to `main` by accident

```bash
# Move the last commit onto a new branch
git branch feat/myname-rescue
git reset --hard origin/main
git checkout feat/myname-rescue
```

Now your work lives on `feat/myname-rescue`, and `main` is clean.

### I want to undo my last commit (but keep the changes)

```bash
git reset --soft HEAD~1
```

Your changes are still in your working folder, but the commit is gone. You can re-commit with a different message.

---

## 13. Glossary

| Term | Meaning |
|---|---|
| **Repository (repo)** | A project tracked by Git |
| **Remote** | The GitHub copy of the repo |
| **Local** | The copy on your laptop |
| **Branch** | A parallel timeline of changes |
| **`main`** | The default, official branch |
| **Commit** | A snapshot of your changes with a message |
| **Stage** | Files marked for the next commit (added via `git add`) |
| **Push** | Upload commits from local to remote |
| **Pull** | Download commits from remote to local |
| **Merge** | Combine two branches into one timeline |
| **Conflict** | Same line edited differently by two people — needs manual resolution |
| **Pull Request (PR)** | GitHub UI for "please review my branch and merge it" |
| **Origin** | The default name for your remote (i.e. GitHub) |
| **HEAD** | The commit you currently have checked out |
| **Stash** | Temporarily set aside uncommitted changes |
| **`.gitignore`** | File listing things Git should NEVER track (secrets, `node_modules/`) |

---

## Final reminder

You will mess up. Everyone messes up Git. The most important rule:

> **`git status` is your friend. Run it constantly.**

It never changes anything — it just tells you the truth about where you are. When in doubt, `git status` first, then think, then act.
