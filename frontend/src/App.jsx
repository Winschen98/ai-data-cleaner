import { useState } from 'react'
import './App.css'

function App() {
  const [selectedFile, setSelectedFile] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()

    if (!selectedFile) {
      setError('Choose a CSV file before starting analysis.')
      return
    }

    setIsLoading(true)
    setError('')
    setAnalysis(null)

    const formData = new FormData()
    formData.append('file', selectedFile)

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      })

      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.detail || 'Analysis failed.')
      }

      setAnalysis(payload)
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
  }

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
            <button type="submit" disabled={isLoading}>
              {isLoading ? 'Analyzing...' : 'Analyze dataset'}
            </button>
          </div>
        </form>

        {error ? <p className="status error">{error}</p> : null}
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
              </div>
            </div>

            <div className="details-grid">
              <article className="detail-card">
                <h3>Column names</h3>
                <ul className="pill-list">
                  {analysis.column_names.map((column) => (
                    <li key={column}>{column}</li>
                  ))}
                </ul>
              </article>

              <article className="detail-card">
                <h3>Missing values</h3>
                <dl className="stats-list">
                  {Object.entries(analysis.missing_values).map(([column, count]) => (
                    <div key={column}>
                      <dt>{column}</dt>
                      <dd>{count}</dd>
                    </div>
                  ))}
                </dl>
              </article>

              <article className="detail-card">
                <h3>Detected types</h3>
                <dl className="stats-list">
                  {Object.entries(analysis.dtypes).map(([column, dtype]) => (
                    <div key={column}>
                      <dt>{column}</dt>
                      <dd>{dtype}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            </div>

            <article className="detail-card preview-card">
              <h3>Preview</h3>
              {analysis.preview.length > 0 ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        {analysis.column_names.map((column) => (
                          <th key={column}>{column}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.preview.map((row, index) => (
                        <tr key={index}>
                          {analysis.column_names.map((column) => (
                            <td key={`${index}-${column}`}>
                              {row[column] == null ? 'Empty' : String(row[column])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="empty-state">No preview rows were returned.</p>
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
