import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'

function createAnalysisPayload(overrides = {}) {
  return {
    filename: 'sample.csv',
    rows: 2,
    columns: 3,
    column_names: ['name', 'email', 'age'],
    dtypes: {
      name: 'object',
      email: 'object',
      age: 'int64',
    },
    missing_values: {
      name: 0,
      email: 1,
      age: 0,
    },
    duplicate_rows: 1,
    issues: [
      {
        kind: 'missing_values',
        severity: 'medium',
        title: 'Missing values detected',
        detail: '1 column contains blank or missing cells.',
        columns: ['email'],
        suggestion: 'Review these columns and decide whether to fill, drop, or keep missing values.',
      },
      {
        kind: 'duplicates',
        severity: 'medium',
        title: 'Duplicate rows detected',
        detail: '1 duplicate row was found in the dataset.',
        columns: [],
        suggestion: 'Review duplicated rows and consider dropping exact duplicates.',
      },
    ],
    preview: [
      { name: 'Alice', email: null, age: 30 },
      { name: 'Bob', email: 'bob@example.com', age: 25 },
    ],
    ...overrides,
  }
}

function jsonResponse(payload, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(payload),
  })
}

async function analyzeDataset(user, payload = createAnalysisPayload()) {
  global.fetch = vi.fn(() => jsonResponse(payload))

  render(<App />)

  const fileInput = screen.getByLabelText(/select csv file/i)
  const file = new File(['name,email,age\nAlice,,30\nBob,bob@example.com,25\n'], 'sample.csv', {
    type: 'text/csv',
  })

  await user.upload(fileInput, file)
  await user.click(screen.getByRole('button', { name: /analyze dataset/i }))

  await screen.findByRole('heading', { name: 'sample.csv' })
  return { file }
}

describe('App', () => {
  beforeEach(() => {
    global.fetch = vi.fn()
  })

  it('renders analysis results after upload', async () => {
    const user = userEvent.setup()

    await analyzeDataset(user)

    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.getByRole('heading', { name: /detected issues/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /keep duplicates/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /leave empty/i })).toBeTruthy()
  })

  it('dismisses missing-value actions locally when leave empty is chosen', async () => {
    const user = userEvent.setup()

    await analyzeDataset(user)
    expect(global.fetch).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: /leave empty/i }))

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /leave empty/i })).toBeNull()
    })
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('dismisses duplicate actions locally when keep duplicates is chosen', async () => {
    const user = userEvent.setup()

    await analyzeDataset(user)
    expect(global.fetch).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: /keep duplicates/i }))

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /keep duplicates/i })).toBeNull()
    })
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('saves inline edits and records the change in recent changes', async () => {
    const user = userEvent.setup()
    const cleanedPayload = {
      action: 'update_cell',
      message: "Updated row 2, column 'age'.",
      cleaned_csv: 'name,email,age\nAlice,,30\nBob,bob@example.com,42\n',
      analysis: createAnalysisPayload({
        duplicate_rows: 0,
        issues: [
          {
            kind: 'missing_values',
            severity: 'medium',
            title: 'Missing values detected',
            detail: '1 column contains blank or missing cells.',
            columns: ['email'],
            suggestion:
              'Review these columns and decide whether to fill, drop, or keep missing values.',
          },
        ],
        preview: [
          { name: 'Alice', email: null, age: 30 },
          { name: 'Bob', email: 'bob@example.com', age: 42 },
        ],
      }),
    }

    global.fetch = vi
      .fn()
      .mockImplementationOnce(() => jsonResponse(createAnalysisPayload()))
      .mockImplementationOnce((url, options) => {
        const body = options.body
        expect(url).toBe('/api/clean')
        expect(body.get('action')).toBe('update_cell')
        expect(body.get('column')).toBe('age')
        expect(body.get('row_index')).toBe('1')
        expect(body.get('value')).toBe('42')

        return jsonResponse(cleanedPayload)
      })

    render(<App />)

    const fileInput = screen.getByLabelText(/select csv file/i)
    const file = new File(['name,email,age\nAlice,,30\nBob,bob@example.com,25\n'], 'sample.csv', {
      type: 'text/csv',
    })

    await user.upload(fileInput, file)
    await user.click(screen.getByRole('button', { name: /analyze dataset/i }))
    await screen.findByRole('heading', { name: 'sample.csv' })

    const rows = screen.getAllByRole('row')
    const secondDataRow = rows[2]
    await user.click(within(secondDataRow).getByRole('button', { name: '25' }))

    const editorInput = screen.getByDisplayValue('25')
    await user.clear(editorInput)
    await user.type(editorInput, '42')
    await user.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(within(secondDataRow).getByRole('button', { name: '42' })).toBeTruthy()
    })
    expect(screen.getByText(/updated cell on age at row 2/i)).toBeTruthy()
    expect(screen.getByText(/updated row 2, column 'age'/i)).toBeTruthy()
  })

  it('undoes the most recent cleaning action locally', async () => {
    const user = userEvent.setup()
    const cleanedPayload = {
      action: 'drop_duplicates',
      message: 'Removed 1 duplicate row(s).',
      cleaned_csv: 'name,email,age\nAlice,,30\n',
      analysis: createAnalysisPayload({
        rows: 1,
        duplicate_rows: 0,
        issues: [
          {
            kind: 'missing_values',
            severity: 'medium',
            title: 'Missing values detected',
            detail: '1 column contains blank or missing cells.',
            columns: ['email'],
            suggestion:
              'Review these columns and decide whether to fill, drop, or keep missing values.',
          },
        ],
        preview: [{ name: 'Alice', email: null, age: 30 }],
      }),
    }

    global.fetch = vi
      .fn()
      .mockImplementationOnce(() => jsonResponse(createAnalysisPayload()))
      .mockImplementationOnce(() => jsonResponse(cleanedPayload))

    render(<App />)

    const fileInput = screen.getByLabelText(/select csv file/i)
    const file = new File(['name,email,age\nAlice,,30\nBob,bob@example.com,25\n'], 'sample.csv', {
      type: 'text/csv',
    })

    await user.upload(fileInput, file)
    await user.click(screen.getByRole('button', { name: /analyze dataset/i }))
    await screen.findByRole('heading', { name: 'sample.csv' })

    await user.click(screen.getByRole('button', { name: /remove exact duplicates/i }))

    await waitFor(() => {
      expect(screen.getByText(/recent changes \(1\)/i)).toBeTruthy()
    })
    expect(screen.queryByRole('button', { name: 'Bob' })).toBeNull()

    await user.click(screen.getByRole('button', { name: /undo last step/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Bob' })).toBeTruthy()
    })
    expect(screen.queryByText(/recent changes \(1\)/i)).toBeNull()
  })
})
