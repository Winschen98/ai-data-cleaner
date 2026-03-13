from io import BytesIO

import numpy as np
import pandas as pd
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

app = FastAPI()


class AnalysisIssue(BaseModel):
    kind: str
    severity: str
    title: str
    detail: str
    columns: list[str] = Field(default_factory=list)
    suggestion: str


class DatasetAnalysisResponse(BaseModel):
    filename: str
    rows: int
    columns: int
    column_names: list[str]
    dtypes: dict[str, str]
    missing_values: dict[str, int]
    duplicate_rows: int
    issues: list[AnalysisIssue]
    suggested_actions: list[str]
    preview: list[dict[str, object | None]]


class CleaningResponse(BaseModel):
    action: str
    message: str
    analysis: DatasetAnalysisResponse


def find_analysis_issues(dataframe: pd.DataFrame) -> tuple[list[AnalysisIssue], list[str]]:
    issues: list[AnalysisIssue] = []
    suggested_actions: list[str] = []

    missing_counts = dataframe.isna().sum().to_dict()
    missing_columns = [
        column for column, count in missing_counts.items() if int(count) > 0
    ]
    if missing_columns:
        issues.append(
            AnalysisIssue(
                kind="missing_values",
                severity="medium",
                title="Missing values detected",
                detail=(
                    f"{len(missing_columns)} column(s) contain blank or missing cells."
                ),
                columns=missing_columns,
                suggestion="Review these columns and decide whether to fill, drop, or keep missing values.",
            )
        )
        suggested_actions.append("Review missing-value handling for flagged columns.")

    duplicate_rows = int(dataframe.duplicated().sum())
    if duplicate_rows > 0:
        issues.append(
            AnalysisIssue(
                kind="duplicates",
                severity="medium",
                title="Duplicate rows detected",
                detail=f"{duplicate_rows} duplicate row(s) were found in the dataset.",
                suggestion="Review duplicated rows and consider dropping exact duplicates.",
            )
        )
        suggested_actions.append("Consider removing exact duplicate rows.")

    for column in dataframe.columns:
        series = dataframe[column].dropna()
        if series.empty or not pd.api.types.is_object_dtype(dataframe[column]):
            continue

        string_values = series.astype(str).str.strip()
        string_values = string_values[string_values != ""]
        if string_values.empty:
            continue

        numeric_values = pd.to_numeric(string_values, errors="coerce")
        numeric_ratio = float(numeric_values.notna().mean())
        numeric_failures = string_values[numeric_values.isna()]
        if 0.8 <= numeric_ratio < 1 and not numeric_failures.empty:
            issues.append(
                AnalysisIssue(
                    kind="numeric_inconsistency",
                    severity="low",
                    title=f"Column '{column}' looks mostly numeric",
                    detail=(
                        f"Most non-empty values in '{column}' look numeric, but "
                        f"{len(numeric_failures)} value(s) could not be converted."
                    ),
                    columns=[str(column)],
                    suggestion="Inspect this column for mixed formats, stray text, or invalid numeric values.",
                )
            )
            suggested_actions.append(
                f"Validate numeric formatting in column '{column}'."
            )

        date_values = pd.to_datetime(string_values, errors="coerce")
        date_ratio = float(date_values.notna().mean())
        if date_ratio >= 0.8:
            issues.append(
                AnalysisIssue(
                    kind="date_candidate",
                    severity="low",
                    title=f"Column '{column}' may contain dates",
                    detail=(
                        f"Most non-empty values in '{column}' can be interpreted as dates."
                    ),
                    columns=[str(column)],
                    suggestion="Consider converting this column to a proper datetime type during cleaning.",
                )
            )
            suggested_actions.append(
                f"Consider parsing column '{column}' as dates."
            )

    deduped_actions = list(dict.fromkeys(suggested_actions))
    return issues, deduped_actions


def read_uploaded_csv(file: UploadFile, contents: bytes) -> pd.DataFrame:
    if not file.filename:
        raise HTTPException(status_code=400, detail="A CSV file is required.")

    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV uploads are supported.")

    if not contents:
        raise HTTPException(status_code=400, detail="The uploaded CSV is empty.")

    try:
        return pd.read_csv(BytesIO(contents))
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


def build_analysis_response(dataframe: pd.DataFrame, filename: str) -> DatasetAnalysisResponse:
    missing_values = {
        column: int(count)
        for column, count in dataframe.isna().sum().to_dict().items()
    }
    duplicate_rows = int(dataframe.duplicated().sum())
    issues, suggested_actions = find_analysis_issues(dataframe)

    preview = dataframe.head(5).replace({np.nan: None, pd.NA: None}).to_dict(
        orient="records"
    )

    return DatasetAnalysisResponse(
        filename=filename,
        rows=int(len(dataframe)),
        columns=int(len(dataframe.columns)),
        column_names=[str(column) for column in dataframe.columns.tolist()],
        dtypes={str(column): str(dtype) for column, dtype in dataframe.dtypes.items()},
        missing_values={str(column): count for column, count in missing_values.items()},
        duplicate_rows=duplicate_rows,
        issues=issues,
        suggested_actions=suggested_actions,
        preview=preview,
    )


def require_column(dataframe: pd.DataFrame, column: str | None) -> str:
    if not column:
        raise HTTPException(status_code=400, detail="A target column is required.")

    if column not in dataframe.columns:
        raise HTTPException(status_code=400, detail=f"Column '{column}' was not found.")

    return column


def apply_cleaning_action(
    dataframe: pd.DataFrame,
    action: str,
    column: str | None = None,
    value: str | None = None,
) -> tuple[pd.DataFrame, str]:
    cleaned_dataframe = dataframe.copy()

    if action == "drop_duplicates":
        original_rows = int(len(cleaned_dataframe))
        cleaned_dataframe = cleaned_dataframe.drop_duplicates().reset_index(drop=True)
        removed_rows = original_rows - int(len(cleaned_dataframe))
        if removed_rows > 0:
            return cleaned_dataframe, f"Removed {removed_rows} duplicate row(s)."
        return cleaned_dataframe, "No duplicate rows were removed."

    if action == "convert_datetime":
        target_column = require_column(cleaned_dataframe, column)
        converted = pd.to_datetime(cleaned_dataframe[target_column], errors="coerce")
        successful_conversions = int(converted.notna().sum())
        if successful_conversions == 0:
            raise HTTPException(
                status_code=400,
                detail=f"Column '{target_column}' could not be converted to datetime values.",
            )

        cleaned_dataframe[target_column] = converted
        return (
            cleaned_dataframe,
            f"Converted column '{target_column}' to datetime for {successful_conversions} row(s).",
        )

    if action == "drop_missing_rows":
        target_column = require_column(cleaned_dataframe, column)
        original_rows = int(len(cleaned_dataframe))
        cleaned_dataframe = cleaned_dataframe.dropna(subset=[target_column]).reset_index(
            drop=True
        )
        removed_rows = original_rows - int(len(cleaned_dataframe))
        return (
            cleaned_dataframe,
            f"Removed {removed_rows} row(s) missing values in '{target_column}'.",
        )

    if action == "fill_missing_fixed":
        target_column = require_column(cleaned_dataframe, column)
        if value is None:
            raise HTTPException(
                status_code=400,
                detail="A replacement value is required for fixed-value fills.",
            )

        missing_before = int(cleaned_dataframe[target_column].isna().sum())
        cleaned_dataframe[target_column] = cleaned_dataframe[target_column].fillna(value)
        return (
            cleaned_dataframe,
            f"Filled {missing_before} missing value(s) in '{target_column}' with '{value}'.",
        )

    if action == "fill_missing_median":
        target_column = require_column(cleaned_dataframe, column)
        numeric_series = pd.to_numeric(cleaned_dataframe[target_column], errors="coerce")
        if numeric_series.notna().sum() == 0:
            raise HTTPException(
                status_code=400,
                detail=f"Column '{target_column}' does not contain numeric values for median fill.",
            )

        median_value = numeric_series.median()
        missing_before = int(cleaned_dataframe[target_column].isna().sum())
        cleaned_dataframe[target_column] = numeric_series.fillna(median_value)
        return (
            cleaned_dataframe,
            f"Filled {missing_before} missing value(s) in '{target_column}' with median {median_value}.",
        )

    if action == "fill_missing_mode":
        target_column = require_column(cleaned_dataframe, column)
        non_null_values = cleaned_dataframe[target_column].dropna()
        if non_null_values.empty:
            raise HTTPException(
                status_code=400,
                detail=f"Column '{target_column}' has no non-empty values available for mode fill.",
            )

        mode_values = non_null_values.mode()
        if mode_values.empty:
            raise HTTPException(
                status_code=400,
                detail=f"Column '{target_column}' has no mode value available for filling.",
            )

        fill_value = mode_values.iloc[0]
        missing_before = int(cleaned_dataframe[target_column].isna().sum())
        cleaned_dataframe[target_column] = cleaned_dataframe[target_column].fillna(fill_value)
        return (
            cleaned_dataframe,
            f"Filled {missing_before} missing value(s) in '{target_column}' with mode '{fill_value}'.",
        )

    raise HTTPException(status_code=400, detail="Unsupported cleaning action.")


@app.get("/")
def read_root():
    return {"message": "AI Data Cleaner backend running"}


@app.post("/analyze", response_model=DatasetAnalysisResponse)
async def analyze_csv(file: UploadFile = File(...)):
    contents = await file.read()
    dataframe = read_uploaded_csv(file, contents)
    return build_analysis_response(dataframe, file.filename)


@app.post("/clean", response_model=CleaningResponse)
async def clean_csv(
    file: UploadFile = File(...),
    action: str = Form(...),
    column: str | None = Form(default=None),
    value: str | None = Form(default=None),
):
    contents = await file.read()
    dataframe = read_uploaded_csv(file, contents)
    cleaned_dataframe, message = apply_cleaning_action(dataframe, action, column, value)

    return CleaningResponse(
        action=action,
        message=message,
        analysis=build_analysis_response(cleaned_dataframe, file.filename),
    )
