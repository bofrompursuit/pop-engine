"use client";

import { useMemo, useState } from "react";
import {
  askedFields,
  intakeWarnings,
  type IntakeContract,
  type IntakeField,
  type IntakeIssue,
  type IntakeValue,
} from "@pop-engine/engine";

// The intake questionnaire. Every question, option, and asked-when condition comes from
// the contract prop, which the server component parses from the published ruleset — this
// component holds no field list of its own.

type Answers = Record<string, IntakeValue>;

type SavedEvent = {
  id: string;
  revision_counter: number;
  [column: string]: unknown;
};

type ApiResponse = {
  event?: SavedEvent;
  errors?: IntakeIssue[];
  warnings?: IntakeIssue[];
  plan_stale?: boolean;
};

/** Descriptive answers the events table carries that the ruleset does not declare. */
const DESCRIPTIVE_QUESTIONS = [
  { field: "name", label: "Event name", type: "text" as const, required: true },
  {
    field: "location_name",
    label: "Venue or location name",
    type: "text" as const,
    required: false,
  },
  {
    field: "capacity",
    label: "Confirmed capacity (optional)",
    type: "number" as const,
    required: false,
  },
];

const humanize = (token: string): string =>
  token.replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase());

const optionLabel = (value: string): string =>
  value === "unknown" ? "I don't know" : humanize(value);

const isBlank = (value: IntakeValue): boolean =>
  value === null || value === undefined || value === "";

export function IntakeForm({
  contract,
  apiBaseUrl,
}: {
  contract: IntakeContract;
  apiBaseUrl: string;
}) {
  const [answers, setAnswers] = useState<Answers>({});
  const [saved, setSaved] = useState<SavedEvent | null>(null);
  const [planStale, setPlanStale] = useState(false);
  const [errors, setErrors] = useState<IntakeIssue[]>([]);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const questions = useMemo(() => askedFields(contract.fields, answers), [contract, answers]);
  // Contradictions and coverage gaps are shown while the organizer types, not only on
  // submit (spec #4, #5). The same function runs server-side on save.
  const warnings = useMemo(() => intakeWarnings(contract, answers), [contract, answers]);
  const errorFor = (field: string) => errors.find((error) => error.field === field);

  const answer = (field: string, value: IntakeValue) => {
    setAnswers((current) => ({ ...current, [field]: value }));
  };

  const submission = (): Record<string, IntakeValue> => {
    const asked = new Set(questions.map((question) => question.field));
    const payload: Record<string, IntakeValue> = {};
    for (const [field, value] of Object.entries(answers)) {
      const descriptive = DESCRIPTIVE_QUESTIONS.some((question) => question.field === field);
      // Answers to questions this event is no longer asked are cleared, not sent.
      if (!descriptive && !asked.has(field)) continue;
      payload[field] = isBlank(value) ? null : value;
    }
    return payload;
  };

  const save = async () => {
    setSaving(true);
    setFailure(null);
    try {
      const target = saved === null ? "/api/events" : `/api/events/${saved.id}`;
      const response = await fetch(`${apiBaseUrl}${target}`, {
        method: saved === null ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submission()),
      });
      const body = (await response.json()) as ApiResponse;
      if (!response.ok || body.event === undefined) {
        setErrors(body.errors ?? []);
        if ((body.errors ?? []).length === 0) setFailure("The event could not be saved.");
        return;
      }
      setErrors([]);
      setSaved(body.event);
      setPlanStale(body.plan_stale === true);
    } catch {
      setFailure("The API could not be reached.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="intake"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <h1>Describe your event</h1>
      <p className="intake__lede">
        Answer what applies to your event. Questions appear as your answers make them relevant, and
        &ldquo;I don&rsquo;t know&rdquo; is a real answer — it is stored as unknown and carried into
        your plan.
      </p>

      {DESCRIPTIVE_QUESTIONS.map((question) => (
        <label className="intake__question" key={question.field}>
          <span className="intake__label">{question.label}</span>
          <input
            className="intake__input"
            name={question.field}
            type={question.type}
            required={question.required}
            value={String(answers[question.field] ?? "")}
            onChange={(event) => {
              const raw = event.target.value;
              answer(
                question.field,
                question.type === "number" ? (raw === "" ? null : Number(raw)) : raw,
              );
            }}
          />
          <FieldError issue={errorFor(question.field)} />
        </label>
      ))}

      {questions.map((question) => (
        <Question
          key={question.field}
          field={question}
          value={answers[question.field] ?? null}
          issue={errorFor(question.field)}
          onAnswer={(value) => answer(question.field, value)}
        />
      ))}

      {warnings.map((warning) => (
        <p className="intake__warning" key={warning.code} role="status">
          <strong>{humanize(warning.code)}:</strong> {warning.message}
        </p>
      ))}

      {errors
        .filter((error) => error.code === "unknown_field" || error.field === "body")
        .map((error) => (
          <p className="intake__error" key={error.field} role="alert">
            {error.message}
          </p>
        ))}
      {failure !== null && (
        <p className="intake__error" role="alert">
          {failure}
        </p>
      )}

      <button className="intake__submit" type="submit" disabled={saving}>
        {saved === null ? "Save event" : "Save changes"}
      </button>

      {saved !== null && (
        <section className="intake__saved" aria-live="polite">
          <p>
            Saved as revision {saved.revision_counter}. Event id <code>{saved.id}</code>.
          </p>
          {planStale && (
            <div className="intake__stale">
              <p>
                This edit is newer than the plan that was generated, so the plan is out of date.
              </p>
              <button type="button" disabled>
                Regenerate plan (arrives with F-201)
              </button>
            </div>
          )}
        </section>
      )}
    </form>
  );
}

function FieldError({ issue }: { issue: IntakeIssue | undefined }) {
  if (issue === undefined) return null;
  return (
    <span className="intake__error" role="alert">
      {issue.message}
    </span>
  );
}

function Question({
  field,
  value,
  issue,
  onAnswer,
}: {
  field: IntakeField;
  value: IntakeValue;
  issue: IntakeIssue | undefined;
  onAnswer: (value: IntakeValue) => void;
}) {
  return (
    <fieldset className="intake__question">
      <legend className="intake__label">{humanize(field.field)}</legend>
      {field.note !== null && <p className="intake__note">{field.note}</p>}
      <Control field={field} value={value} onAnswer={onAnswer} />
      <FieldError issue={issue} />
    </fieldset>
  );
}

function Control({
  field,
  value,
  onAnswer,
}: {
  field: IntakeField;
  value: IntakeValue;
  onAnswer: (value: IntakeValue) => void;
}) {
  if (field.type === "enum" || field.type === "boolean") {
    const options: { value: string; label: string }[] =
      field.type === "boolean"
        ? [
            { value: "true", label: "Yes" },
            { value: "false", label: "No" },
          ]
        : (field.values ?? []).map((option) => ({ value: option, label: optionLabel(option) }));
    return (
      <div className="intake__options">
        {options.map((option) => (
          <label className="intake__option" key={option.value}>
            <input
              type="radio"
              name={field.field}
              value={option.value}
              checked={String(value) === option.value}
              onChange={() =>
                onAnswer(field.type === "boolean" ? option.value === "true" : option.value)
              }
            />
            {option.label}
          </label>
        ))}
      </div>
    );
  }

  if (field.type === "multi_enum") {
    const selected = Array.isArray(value) ? value : [];
    return (
      <div className="intake__options">
        {(field.values ?? []).map((option) => (
          <label className="intake__option" key={option}>
            <input
              type="checkbox"
              name={field.field}
              value={option}
              checked={selected.includes(option)}
              onChange={(event) => onAnswer(toggleOption(selected, option, event.target.checked))}
            />
            {optionLabel(option)}
          </label>
        ))}
      </div>
    );
  }

  return (
    <input
      className="intake__input"
      name={field.field}
      type={field.type === "date" ? "date" : "number"}
      step={field.type === "number" ? "any" : undefined}
      value={value === null ? "" : String(value)}
      onChange={(event) => {
        const raw = event.target.value;
        if (raw === "") return onAnswer(null);
        onAnswer(field.type === "date" ? raw : Number(raw));
      }}
    />
  );
}

/** "None" is exclusive, so it clears the other options and they clear it. */
function toggleOption(
  selected: readonly string[],
  option: string,
  checked: boolean,
): readonly string[] {
  if (!checked) return selected.filter((value) => value !== option);
  if (option === "none") return ["none"];
  return [...selected.filter((value) => value !== "none"), option];
}
