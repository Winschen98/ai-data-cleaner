import { useRef, useState } from 'react'
import './App.css'

function formatActionLabel(action, options = {}) {
  const columnSuffix = options.column ? ` on ${options.column}` : ''
  const rowSuffix =
    Number.isInteger(options.rowIndex) ? ` at row ${options.rowIndex + 1}` : ''

  switch (action) {
    case 'drop_duplicates':
      return 'Removed exact duplicate rows'
    case 'convert_datetime':
      return `Converted values to datetime${columnSuffix}`
    case 'drop_missing_rows':
      return `Dropped rows with missing values${columnSuffix}`
    case 'fill_missing_fixed':
      return `Filled missing values with a custom value${columnSuffix}`
    case 'update_cell':
      return `Updated cell${columnSuffix}${rowSuffix}`
    case 'clear_cell':
      return `Cleared cell${columnSuffix}${rowSuffix}`
    case 'fill_missing_median':
      return `Filled missing values with median${columnSuffix}`
    case 'fill_missing_mode':
      return `Filled missing values with most common value${columnSuffix}`
    default:
      return action
  }
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
    preview,
  }
}

function App() {
  const previewRef = useRef(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isCleaning, setIsCleaning] = useState(false)
  const [cleaningMessage, setCleaningMessage] = useState('')
  const [customFillValues, setCustomFillValues] = useState({})
  const [originalSnapshot, setOriginalSnapshot] = useState(null)
  const [history, setHistory] = useState([])
  const [dismissedMissingColumns, setDismissedMissingColumns] = useState([])
  const [duplicatesDismissed, setDuplicatesDismissed] = useState(false)
  const [editingCell, setEditingCell] = useState(null)
  const [editingValue, setEditingValue] = useState('')

  function buildCleanedFilename(filename) {
    if (typeof filename !== 'string' || filename.trim() === '') {
      return 'cleaned-data.csv'
    }

    const trimmedFilename = filename.trim()
    const withoutCsv = trimmedFilename.replace(/\.csv$/i, '')
    const normalizedBase = withoutCsv.replace(/([._-]cleaned)+$/i, '')

    return `${normalizedBase}_cleaned.csv`
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

      const normalizedAnalysis = normalizeAnalysis(payload)
      setAnalysis(normalizedAnalysis)
      setOriginalSnapshot({
        file: selectedFile,
        analysis: normalizedAnalysis,
      })
      setHistory([])
      setDismissedMissingColumns([])
      setDuplicatesDismissed(false)
      setEditingCell(null)
      setEditingValue('')
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
    setOriginalSnapshot(null)
    setHistory([])
    setDismissedMissingColumns([])
    setDuplicatesDismissed(false)
    setEditingCell(null)
    setEditingValue('')
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
    if (Number.isInteger(options.rowIndex)) {
      formData.append('row_index', options.rowIndex)
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

      const nextCleaningMessage =
        typeof payload.message === 'string' && payload.message.trim()
          ? payload.message
          : 'Cleaning completed.'

      setHistory((currentHistory) => [
        ...currentHistory,
        {
          label: formatActionLabel(action, options),
          action,
          options,
          file: selectedFile,
          analysis,
          message: nextCleaningMessage,
        },
      ])

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
      setCleaningMessage(nextCleaningMessage)
      setDismissedMissingColumns([])
      setDuplicatesDismissed(false)
      setEditingCell(null)
      setEditingValue('')
      requestAnimationFrame(() => {
        previewRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        })
      })
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

  function handleLeaveEmpty(column) {
    setDismissedMissingColumns((currentColumns) =>
      currentColumns.includes(column) ? currentColumns : [...currentColumns, column],
    )
    setCleaningMessage(`Leaving missing values unchanged in '${column}'.`)
    setError('')
  }

  function handleKeepDuplicates() {
    setDuplicatesDismissed(true)
    setCleaningMessage('Keeping exact duplicate rows in the current dataset.')
    setError('')
  }

  function handleEditStart(rowIndex, column, currentValue) {
    setEditingCell({ rowIndex, column })
    setEditingValue(currentValue == null || currentValue === '' ? '' : String(currentValue))
  }

  function handleEditCancel() {
    setEditingCell(null)
    setEditingValue('')
  }

  function handleEditSave(rowIndex, column) {
    if (editingValue === '') {
      handleClean('clear_cell', {
        rowIndex,
        column,
      })
      return
    }

    handleClean('update_cell', {
      rowIndex,
      column,
      value: editingValue,
    })
  }

  function handleUndo() {
    if (history.length === 0) {
      return
    }

    const previousSnapshot = history[history.length - 1]
    setHistory((currentHistory) => currentHistory.slice(0, -1))
    setSelectedFile(previousSnapshot.file)
    setAnalysis(previousSnapshot.analysis)
    setCleaningMessage('Reverted the most recent cleaning action.')
    setError('')
    setDismissedMissingColumns([])
    setDuplicatesDismissed(false)
    setEditingCell(null)
    setEditingValue('')
  }

  function handleReset() {
    if (!originalSnapshot) {
      return
    }

    setSelectedFile(originalSnapshot.file)
    setAnalysis(originalSnapshot.analysis)
    setHistory([])
    setCleaningMessage('Reset to the original analyzed dataset.')
    setError('')
    setDismissedMissingColumns([])
    setDuplicatesDismissed(false)
    setEditingCell(null)
    setEditingValue('')
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
  const visibleIssues = issues.filter((issue) => {
    if (issue.kind === 'duplicates' && duplicatesDismissed) {
      return false
    }

    if (issue.kind !== 'missing_values' || !Array.isArray(issue.columns)) {
      return true
    }

    return issue.columns.some((column) => !dismissedMissingColumns.includes(column))
  })

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
                <>
                  <button
                    className="download-action"
                    type="button"
                    onClick={handleDownloadCurrentFile}
                    disabled={isLoading || isCleaning || !selectedFile}
                  >
                    Download current CSV
                  </button>
                  <button
                    className="download-action"
                    type="button"
                    onClick={handleUndo}
                    disabled={isLoading || isCleaning || history.length === 0}
                  >
                    Undo last step
                  </button>
                  <button
                    className="download-action"
                    type="button"
                    onClick={handleReset}
                    disabled={isLoading || isCleaning || !originalSnapshot}
                  >
                    Reset to original
                  </button>
                </>
              ) : null}
              <button type="submit" disabled={isLoading}>
                {isLoading ? 'Analyzing...' : 'Analyze dataset'}
              </button>
            </div>
          </div>
        </form>

        {analysis ? (
          <p className="workspace-meta">
            {history.length > 0
              ? `${history.length} change${history.length === 1 ? '' : 's'} available to undo.`
              : 'You are viewing the current working dataset.'}
          </p>
        ) : null}

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
              <article className="detail-card preview-card preview-priority" ref={previewRef}>
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
                <div className="preview-history-shell">
                  {history.length > 0 ? (
                    <div className="preview-history">
                      <p className="preview-history-label">
                        Recent changes ({history.length})
                      </p>
                      <div className="preview-history-list">
                        {history.map((step, index) => (
                          <article
                            className="preview-history-item"
                            key={`${step.action}-${index}`}
                          >
                            <strong>{step.label}</strong>
                            <span>{step.message}</span>
                          </article>
                        ))}
                      </div>
                    </div>
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
                                {editingCell?.rowIndex === index &&
                                editingCell?.column === column ? (
                                  <div className="cell-editor">
                                    <input
                                      autoFocus
                                      type="text"
                                      value={editingValue}
                                      onChange={(event) =>
                                        setEditingValue(event.target.value)
                                      }
                                    />
                                    <div className="cell-editor-actions">
                                      <button
                                        className="cell-action"
                                        type="button"
                                        onClick={() => handleEditSave(index, column)}
                                        disabled={isCleaning || isLoading}
                                      >
                                        Save
                                      </button>
                                      <button
                                        className="cell-action secondary"
                                        type="button"
                                        onClick={handleEditCancel}
                                        disabled={isCleaning || isLoading}
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    className={`table-cell-button${
                                      row[column] == null || row[column] === '' ? ' empty' : ''
                                    }`}
                                    type="button"
                                    onClick={() => handleEditStart(index, column, row[column])}
                                  >
                                    {row[column] == null || row[column] === ''
                                      ? 'Empty'
                                      : String(row[column])}
                                  </button>
                                )}
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

              <article className="detail-card">
                <h3>Detected issues</h3>
                {visibleIssues.length > 0 ? (
                  <div className="issue-list">
                    {visibleIssues.map((issue, index) => {
                      return (
                        <article
                          className={`issue-card severity-${issue.severity || 'low'}`}
                          key={`${issue.kind || 'issue'}-${index}`}
                        >
                        <div className="issue-heading">
                          <p className="issue-kicker">{issue.kind || 'issue'}</p>
                          <span>{issue.severity || 'low'} priority</span>
                        </div>
                        <p className="issue-suggestion">
                          {issue.suggestion || 'Review this dataset section before cleaning.'}
                        </p>
                        <h4>{issue.title || 'Dataset issue detected'}</h4>
                        <p>{issue.detail || 'No detail provided.'}</p>
                        {Array.isArray(issue.columns) && issue.columns.length > 0 ? (
                          <p className="issue-columns">
                            Columns: {issue.columns.join(', ')}
                          </p>
                        ) : null}
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
                        {issue.kind === 'duplicates' ? (
                          <div className="issue-actions">
                            <button
                              className="secondary-action"
                              type="button"
                              onClick={() => handleClean('drop_duplicates')}
                              disabled={isCleaning || isLoading}
                            >
                              {isCleaning ? 'Removing duplicates...' : 'Remove exact duplicates'}
                            </button>
                            <button
                              className="secondary-action"
                              type="button"
                              onClick={handleKeepDuplicates}
                              disabled={isCleaning || isLoading}
                            >
                              Keep duplicates
                            </button>
                          </div>
                        ) : null}
                        {issue.kind === 'missing_values' &&
                        Array.isArray(issue.columns) &&
                        issue.columns.length > 0 ? (
                          <div className="column-action-groups">
                            {issue.columns
                              .filter((column) => !dismissedMissingColumns.includes(column))
                              .map((column) => {
                              const customValue = customFillValues[column] ?? ''

                              return (
                                <div className="column-action-card" key={`missing-${column}`}>
                                  <div className="column-action-header">
                                    <strong>{column}</strong>
                                    <span>{analysis.dtypes[column] || 'unknown type'}</span>
                                  </div>
                                  <p className="column-action-note">
                                    Leave empty if missing values are valid for this column.
                                  </p>
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
                                    <button
                                      className="secondary-action"
                                      type="button"
                                      onClick={() => handleLeaveEmpty(column)}
                                      disabled={isCleaning || isLoading}
                                    >
                                      Leave empty
                                    </button>
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
                      )
                    })}
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
