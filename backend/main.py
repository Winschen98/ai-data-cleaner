from io import BytesIO

import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile

app = FastAPI()


@app.get("/")
def read_root():
    return {"message": "AI Data Cleaner backend running"}


@app.post("/analyze")
async def analyze_csv(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="A CSV file is required.")

    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV uploads are supported.")

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="The uploaded CSV is empty.")

    try:
        dataframe = pd.read_csv(BytesIO(contents))
    except pd.errors.EmptyDataError as exc:
        raise HTTPException(status_code=400, detail="The uploaded CSV has no rows.") from exc
    except pd.errors.ParserError as exc:
        raise HTTPException(
            status_code=400,
            detail="The uploaded file could not be parsed as CSV.",
        ) from exc
    except UnicodeDecodeError as exc:
        raise HTTPException(
            status_code=400,
            detail="The uploaded file is not valid UTF-8 text.",
        ) from exc

    return {
        "filename": file.filename,
        "rows": int(len(dataframe)),
        "columns": int(len(dataframe.columns)),
        "column_names": dataframe.columns.tolist(),
        "dtypes": {column: str(dtype) for column, dtype in dataframe.dtypes.items()},
        "missing_values": {
            column: int(count)
            for column, count in dataframe.isna().sum().to_dict().items()
        },
        "preview": dataframe.head(5).where(pd.notnull(dataframe.head(5)), None).to_dict(
            orient="records"
        ),
    }
