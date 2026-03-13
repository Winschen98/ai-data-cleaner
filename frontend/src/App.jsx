import { useState } from 'react'
import './App.css'

function isNumericDtype(dtype) {
  return typeof dtype === 'string' && /(int|float|double|number|decimal)/i.test(dtype)
}

function normalizeAnalysis(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('The server returned an invalid analysis response.')
  }

  const filename =
    typeof payload.filename === 'string' && payload.filename.trim()
      ? payload.filename
      : 'Uploaded dataset'

  const rows = Number.isFinite(payload.rows) ? payload.rows : 0
  const columns = Number.isFinite(payload.columns) ? payload.columns : 0
  const columnNames = Array.isArray(payload.column_names)
    ? payload.column_names.filter((column) => typeof column === 'string')
    : []
  const dtypes =
    payload.dtypes && typeof payload.dtypes === 'object' ? payload.dtypes : {}
  const missingValues =
    payload.missing_values && typeof payload.missing_values === 'object'
      ? payload.missing_values
      : {}
  const duplicateRows = Number.isFinite(payload.duplicate_rows)
    ? payload.duplicate_rows
    : 0
  const issues = Array.isArray(payload.issues)
    ? payload.issues.filter((issue) => issue && typeof issue === 'object')
    : []
  const suggestedActions = Array.isArray(payload.suggested_actions)
    ? payload.suggested_actions.filter((action) => typeof action === 'string')
    : []
  const preview = Array.isArray(payload.preview)
    ? payload.preview.filter((row) => row && typeof row === 'object')
    : []

  return {
    filename,
    rows,
    columns,
    columnNames,
    dtypes,
    missingValues,
    duplicateRows,
    issues,
    suggestedActions,
    preview,
  }
}

function App() {
  const [selectedFile, setSelectedFile] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isCleaning, setIsCleaning] = useState(false)
  const [cleaningMessage, setCleaningMessage] = useState('')
  const [customFillValues, setCustomFillValues] = useState({})

  function buildCleanedFilename(filename) {
    if (typeof filename !== 'string' || filename.trim() === '') {
      return 'cleaned-data.csv'
    }

    if (filename.toLowerCase().endsWith('.csv')) {
      return filename.replace(/\.csv$/i, '.cleaned.csv')
    }

    return `${filename}.cleaned.csv`
  }

  async function handleSubmit(event) {
    event.preventDefault()

    if (!selectedFile) {
      setError('Choose a CSV file before starting analysis.')
      return
    }

    setIsLoading(true)
    setError('')
    setAnalysis(null)
    setCleaningMessage('')

    const formData = new FormData()
    formData.append('file', selectedFile)

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      })

      let payload = null
      try {
        payload = await response.json()
      } catch {
        throw new Error('The server returned a non-JSON response.')
      }

      if (!response.ok) {
        throw new Error(payload.detail || 'Analysis failed.')
      }

      setAnalysis(normalizeAnalysis(payload))
    } catch (requestError) {
      setError(requestError.message || 'Unable to analyze the CSV right now.')
    } finally {
      setIsLoading(false)
    }
  }

  function handleFileChange(event) {
    const nextFile = event.target.files?.[0] ?? null
    setSelectedFile(nextFile)
    setError('')
    setAnalysis(null)
    setCleaningMessage('')
    setCustomFillValues({})
  }

  async function handleClean(action, options = {}) {
    if (!selectedFile) {
      setError('Choose a CSV file before running a cleaning action.')
      return
    }

    setIsCleaning(true)
    setError('')
    setCleaningMessage('')

    const formData = new FormData()
    formData.append('file', selectedFile)
    formData.append('action', action)
    if (options.column) {
      formData.append('column', options.column)
    }
    if (options.value !== undefined) {
      formData.append('value', options.value)
    }

    try {
      const response = await fetch('/api/clean', {
        method: 'POST',
        body: formData,
      })

      let payload = null
      try {
        payload = await response.json()
      } catch {
        throw new Error('The server returned a non-JSON response.')
      }

      if (!response.ok) {
        throw new Error(payload.detail || 'Cleaning failed.')
      }

      if (typeof payload.cleaned_csv === 'string') {
        const nextFilename = buildCleanedFilename(
          payload.analysis?.filename || selectedFile.name,
        )
        const nextFile = new File([payload.cleaned_csv], nextFilename, {
          type: 'text/csv',
        })
        setSelectedFile(nextFile)
      }

      setAnalysis(normalizeAnalysis(payload.analysis))
      setCleaningMessage(
        typeof payload.message === 'string' && payload.message.trim()
          ? payload.message
          : 'Cleaning completed.',
      )
    } catch (requestError) {
      setError(requestError.message || 'Unable to clean the CSV right now.')
    } finally {
      setIsCleaning(false)
    }
  }

  function handleCustomFillValueChange(column, value) {
    setCustomFillValues((currentValues) => ({
      ...currentValues,
      [column]: value,
    }))
  }

  function handleDownloadCurrentFile() {
    if (!selectedFile) {
      return
    }

    const objectUrl = URL.createObjectURL(selectedFile)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = selectedFile.name
    link.click()
    URL.revokeObjectURL(objectUrl)
  }

  const columnNames = analysis?.columnNames ?? []
  const previewRows = analysis?.preview ?? []
  const previewColumns =
    columnNames.length > 0
      ? columnNames
      : Array.from(
          new Set(previewRows.flatMap((row) => Object.keys(row ?? {}))),
        )
  const hasPreview = previewRows.length > 0 && previewColumns.length > 0
  const hasColumnMetadata = columnNames.length > 0
  const dtypeEntries = analysis ? Object.entries(analysis.dtypes) : []
  const missingValueEntries = analysis ? Object.entries(analysis.missingValues) : []
  const issues = analysis?.issues ?? []
  const suggestedActions = analysis?.suggestedActions ?? []

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <p className="eyebrow">AI Data Cleaner</p>
        <h1>Upload a CSV and inspect the dataset in seconds.</h1>
        <p className="lede">
          This first slice lets you send a CSV to the FastAPI backend and see a
          quick structural summary generated with pandas.
        </p>

        <form className="upload-form" onSubmit={handleSubmit}>
          <label className="file-picker" htmlFor="csv-upload">
            <span>Select CSV file</span>
            <input
              id="csv-upload"
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
            />
          </label>

          <div className="upload-actions">
            <p className="file-name">
              {selectedFile ? selectedFile.name : 'No file selected yet'}
            </p>
            <div className="primary-actions">
              {analysis ? (
                <button
                  className="download-action"
                  type="button"
                  onClick={handleDownloadCurrentFile}
                  disabled={isLoading || isCleaning || !selectedFile}
                >
                  Download current CSV
                </button>
              ) : null}
              <button type="submit" disabled={isLoading}>
                {isLoading ? 'Analyzing...' : 'Analyze dataset'}
              </button>
            </div>
          </div>
        </form>

        {error ? <p className="status error">{error}</p> : null}
        {cleaningMessage ? <p className="status success">{cleaningMessage}</p> : null}
      </section>

      <section className="results-panel">
        {analysis ? (
          <>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Analysis Result</p>
                <h2>{analysis.filename}</h2>
              </div>
              <div className="summary-grid">
                <article>
                  <span>Rows</span>
                  <strong>{analysis.rows}</strong>
                </article>
                <article>
                  <span>Columns</span>
                  <strong>{analysis.columns}</strong>
                </article>
                <article>
                  <span>Duplicates</span>
                  <strong>{analysis.duplicateRows}</strong>
                </article>
              </div>
            </div>

            <div className="details-grid insight-grid">
              <article className="detail-card">
                <h3>Detected issues</h3>
                {issues.length > 0 ? (
                  <div className="issue-list">
                    {issues.map((issue, index) => (
                      <article
                        className={`issue-card severity-${issue.severity || 'low'}`}
                        key={`${issue.kind || 'issue'}-${index}`}
                      >
                        <div className="issue-heading">
                          <p className="issue-kicker">{issue.kind || 'issue'}</p>
                          <span>{issue.severity || 'low'} priority</span>
                        </div>
                        <h4>{issue.title || 'Dataset issue detected'}</h4>
                        <p>{issue.detail || 'No detail provided.'}</p>
                        {Array.isArray(issue.columns) && issue.columns.length > 0 ? (
                          <p className="issue-columns">
                            Columns: {issue.columns.join(', ')}
                          </p>
                        ) : null}
                        <p className="issue-suggestion">
                          {issue.suggestion || 'Review this dataset section before cleaning.'}
                        </p>
                        {issue.kind === 'date_candidate' &&
                        Array.isArray(issue.columns) &&
                        issue.columns.length > 0 ? (
                          <div className="issue-actions">
                            {issue.columns.map((column) => (
                              <button
                                className="secondary-action"
                                type="button"
                                key={`convert-${column}`}
                                onClick={() =>
                                  handleClean('convert_datetime', { column })
                                }
                                disabled={isCleaning || isLoading}
                              >
                                {isCleaning ? 'Applying...' : `Convert ${column} to datetime`}
                              </button>
                            ))}
                          </div>
                        ) : null}
                        {issue.kind === 'missing_values' &&
                        Array.isArray(issue.columns) &&
                        issue.columns.length > 0 ? (
                          <div className="column-action-groups">
                            {issue.columns.map((column) => {
                              const dtype = analysis.dtypes[column]
                              const numericColumn = isNumericDtype(dtype)
                              const customValue = customFillValues[column] ?? ''

                              return (
                                <div className="column-action-card" key={`missing-${column}`}>
                                  <div className="column-action-header">
                                    <strong>{column}</strong>
                                    <span>{dtype || 'unknown type'}</span>
                                  </div>
                                  <div className="inline-actions">
                                    <button
                                      className="secondary-action"
                                      type="button"
                                      onClick={() =>
                                        handleClean('drop_missing_rows', { column })
                                      }
                                      disabled={isCleaning || isLoading}
                                    >
                                      Drop missing rows
                                    </button>
                                    {numericColumn ? (
                                      <button
                                        className="secondary-action"
                                        type="button"
                                        onClick={() =>
                                          handleClean('fill_missing_median', { column })
                                        }
                                        disabled={isCleaning || isLoading}
                                      >
                                        Fill with median
                                      </button>
                                    ) : (
                                      <button
                                        className="secondary-action"
                                        type="button"
                                        onClick={() =>
                                          handleClean('fill_missing_mode', { column })
                                        }
                                        disabled={isCleaning || isLoading}
                                      >
                                        Fill with most common value
                                      </button>
                                    )}
                                  </div>
                                  <div className="custom-fill-row">
                                    <input
                                      type="text"
                                      value={customValue}
                                      onChange={(event) =>
                                        handleCustomFillValueChange(column, event.target.value)
                                      }
                                      placeholder="Custom fill value"
                                    />
                                    <button
                                      className="secondary-action"
                                      type="button"
                                      onClick={() =>
                                        handleClean('fill_missing_fixed', {
                                          column,
                                          value: customValue,
                                        })
                                      }
                                      disabled={isCleaning || isLoading || customValue === ''}
                                    >
                                      Fill with custom value
                                    </button>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state-box">
                    <p className="empty-state-title">No issues flagged</p>
                    <p className="empty-state">
                      This dataset did not trigger any lightweight heuristics yet.
                    </p>
                  </div>
                )}
              </article>

              <article className="detail-card">
                <h3>Suggested actions</h3>
                {suggestedActions.length > 0 ? (
                  <>
                    <ol className="action-list">
                      {suggestedActions.map((action) => (
                        <li key={action}>{action}</li>
                      ))}
                    </ol>
                    {analysis.duplicateRows > 0 ? (
                      <button
                        className="secondary-action"
                        type="button"
                        onClick={() => handleClean('drop_duplicates')}
                        disabled={isCleaning || isLoading}
                      >
                        {isCleaning ? 'Removing duplicates...' : 'Remove exact duplicates'}
                      </button>
                    ) : null}
                  </>
                ) : (
                  <div className="empty-state-box">
                    <p className="empty-state-title">No actions suggested</p>
                    <p className="empty-state">
                      Upload another dataset or expand the backend heuristics to surface more guidance.
                    </p>
                  </div>
                )}
              </article>
            </div>

            <div className="details-grid">
              <article className="detail-card">
                <h3>Column names</h3>
                {hasColumnMetadata ? (
                  <ul className="pill-list">
                    {columnNames.map((column) => (
                      <li key={column}>{column}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-state">
                    No column names were returned for this dataset.
                  </p>
                )}
              </article>

              <article className="detail-card">
                <h3>Missing values</h3>
                {missingValueEntries.length > 0 ? (
                  <dl className="stats-list">
                    {missingValueEntries.map(([column, count]) => (
                      <div key={column}>
                        <dt>{column}</dt>
                        <dd>{count}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="empty-state">
                    Missing-value counts were not included in the response.
                  </p>
                )}
              </article>

              <article className="detail-card">
                <h3>Detected types</h3>
                {dtypeEntries.length > 0 ? (
                  <dl className="stats-list">
                    {dtypeEntries.map(([column, dtype]) => (
                      <div key={column}>
                        <dt>{column}</dt>
                        <dd>{dtype}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="empty-state">
                    Column type information was not included in the response.
                  </p>
                )}
              </article>
            </div>

            <article className="detail-card preview-card">
              <div className="preview-header">
                <div>
                  <h3>Preview</h3>
                  <p className="preview-copy">
                    Showing up to the first five rows returned by the backend.
                  </p>
                </div>
                {hasPreview ? (
                  <p className="table-meta">
                    {previewRows.length} row{previewRows.length === 1 ? '' : 's'} shown
                  </p>
                ) : null}
              </div>
              {hasPreview ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        {previewColumns.map((column) => (
                          <th key={column}>{column}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, index) => (
                        <tr key={index}>
                          {previewColumns.map((column) => (
                            <td key={`${index}-${column}`}>
                              {row[column] == null || row[column] === ''
                                ? 'Empty'
                                : String(row[column])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state-box">
                  <p className="empty-state-title">No preview available</p>
                  <p className="empty-state">
                    The dataset summary loaded, but the server did not return any
                    preview rows we could display.
                  </p>
                </div>
              )}
            </article>
          </>
        ) : (
          <div className="empty-panel">
            <p className="eyebrow">Waiting for data</p>
            <h2>No dataset analyzed yet.</h2>
            <p>
              Choose a CSV file and run the analysis to see row counts, column
              details, missing values, and a five-row preview.
            </p>
          </div>
        )}
      </section>
    </main>
  )
}

export default App
