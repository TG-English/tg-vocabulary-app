# TG Vocabulary App — Production Architecture

## 1. Goal

The existing vocabulary upload, quiz, auto-grading, wrong-answer retry, score list, responsive design, and TG branding remain available. The production version adds authenticated users, centralized data, class-scoped teacher permissions, and academy-wide administrator permissions.

## 2. Recommended stack

| Area | Choice | Reason |
| --- | --- | --- |
| Frontend | Vite + modular JavaScript | Portable to GitHub Pages, Vercel, and Netlify |
| Authentication | Supabase Auth | Email/password login and session management |
| Database | Supabase PostgreSQL | Relational data fits classes, tests, attempts, and reports |
| Authorization | PostgreSQL Row Level Security | Access is checked by the database, not only hidden in the UI |
| Spreadsheet parsing | SheetJS | Preserves the current Excel/CSV upload workflow |
| Hosting | GitHub Pages now; Vercel/Netlify compatible | No dependency on a single paid app builder |

The browser uses only the Supabase public anonymous key. The service-role key is never included in frontend code.

## 3. Data model

| Table | Purpose | Important relationships |
| --- | --- | --- |
| `profiles` | User name and role | One-to-one with `auth.users` |
| `classes` | Academy classes | Created and controlled by administrators |
| `class_teachers` | Teacher assignments | Teacher ↔ class many-to-many |
| `class_students` | Student enrollment | Student ↔ class; includes student number/status |
| `vocabulary_books` | Uploaded word lists | Owned by a teacher/admin; sample data flag |
| `vocabulary_words` | English headword and Korean meaning | Belongs to a vocabulary book |
| `tests` | Quiz configuration | Belongs to a class and vocabulary book |
| `test_questions` | Fixed question order/content | Belongs to a test and word |
| `test_assignments` | Students allowed to take a test | Test ↔ student |
| `test_attempts` | Score and completion record | Test + student + attempt number |
| `attempt_answers` | Each submitted answer | Attempt + question; correctness and answer snapshot |

Every real-data table has `academy_id` or reaches it through a protected relationship, allowing future multi-branch separation. Sample books use `is_sample = true`; actual student data never ships in source code.

## 4. Permission model

| Capability | Student | Teacher | Administrator |
| --- | :---: | :---: | :---: |
| Take assigned tests | ✓ |  | ✓ |
| View own score/wrong answers | ✓ |  | ✓ |
| View another student |  | Assigned classes only | ✓ |
| Register/edit students |  | Assigned classes only | ✓ |
| Upload/edit vocabulary |  | Own/assigned content | ✓ |
| Create tests |  | Assigned classes only | ✓ |
| View class statistics |  | Assigned classes only | ✓ |
| Manage teachers/classes |  |  | ✓ |
| View academy-wide results |  |  | ✓ |

Permissions are enforced twice: route/menu guards improve the interface, while Supabase RLS is the authoritative security boundary.

## 5. Screen list

### Shared

1. Login / password reset
2. Role-based home dashboard
3. Profile / logout
4. Access denied / expired session

### Student

1. Assigned tests
2. Test instructions
3. Quiz: English → Korean
4. Quiz: Korean → English
5. Spelling/listening quiz
6. Immediate result
7. Wrong-answer review and retest
8. My score history

### Teacher

1. Teacher dashboard
2. My classes
3. Class roster: add/edit/deactivate student
4. Vocabulary books
5. Excel upload and validation preview
6. Word editor
7. Test builder and assignment
8. Class result list
9. Student detail
10. Wrong-answer statistics

### Administrator

1. Academy overview
2. Class management
3. Teacher management
4. All-student management
5. All vocabulary/tests
6. Academy-wide results and exports
7. Branding/settings

## 6. Repository layout

```text
tg-vocabulary-app/
├── index.html                 # Current working app entry
├── app.js                     # Current local/demo feature set
├── styles.css                 # Responsive TG design
├── assets/                    # TG logo and public assets
├── docs/                      # Architecture, screens, rollout notes
├── supabase/
│   └── migrations/            # Versioned database schema and RLS
├── .env.example               # Safe variable names only
└── .gitignore                 # Secrets and private exports excluded
```

In the next implementation stage, frontend modules will be introduced under `src/` while the existing screens remain available as local/demo mode until Supabase is configured.

## 7. Phased rollout

1. **Foundation:** schema, RLS, screen map, secret handling, portable deployment.
2. **Authentication:** login, role loading, protected navigation.
3. **Teacher operations:** classes, students, vocabulary import/editor, test builder.
4. **Student operations:** assigned tests, grading, retest, personal history.
5. **Reporting:** class/admin dashboards, wrong-answer stats, CSV export.
6. **Production hardening:** seed administrator, acceptance tests, backup/restore, deployment.

