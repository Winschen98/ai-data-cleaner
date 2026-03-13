import io
import pathlib
import sys
import unittest

from fastapi.testclient import TestClient

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from main import app


class BackendApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def make_csv_upload(self, content: str, filename: str = "sample.csv"):
        return {
            "file": (
                filename,
                io.BytesIO(content.encode("utf-8")),
                "text/csv",
            )
        }

    def test_analyze_csv_returns_dataset_statistics_and_preview(self):
        response = self.client.post(
            "/analyze",
            files=self.make_csv_upload(
                "name,email,age\n"
                "Alice,alice@example.com,30\n"
                "Bob,,25\n"
                "Bob,,25\n"
            ),
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()

        self.assertEqual(payload["filename"], "sample.csv")
        self.assertEqual(payload["rows"], 3)
        self.assertEqual(payload["columns"], 3)
        self.assertEqual(payload["column_names"], ["name", "email", "age"])
        self.assertEqual(payload["missing_values"]["email"], 2)
        self.assertEqual(payload["duplicate_rows"], 1)
        self.assertEqual(payload["preview"][1]["email"], None)
        self.assertTrue(
            any(issue["kind"] == "missing_values" for issue in payload["issues"])
        )
        self.assertTrue(
            any(issue["kind"] == "duplicates" for issue in payload["issues"])
        )

    def test_clean_drop_duplicates_removes_duplicate_rows(self):
        response = self.client.post(
            "/clean",
            files=self.make_csv_upload(
                "name,email\n"
                "Alice,alice@example.com\n"
                "Alice,alice@example.com\n"
                "Bob,bob@example.com\n"
            ),
            data={"action": "drop_duplicates"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()

        self.assertEqual(payload["action"], "drop_duplicates")
        self.assertEqual(payload["analysis"]["rows"], 2)
        self.assertEqual(payload["analysis"]["duplicate_rows"], 0)
        self.assertIn("Removed 1 duplicate row(s).", payload["message"])

    def test_clean_fill_missing_fixed_updates_missing_values(self):
        response = self.client.post(
            "/clean",
            files=self.make_csv_upload(
                "name,email\n"
                "Alice,\n"
                "Bob,bob@example.com\n"
            ),
            data={
                "action": "fill_missing_fixed",
                "column": "email",
                "value": "unknown@example.com",
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()

        self.assertEqual(payload["analysis"]["missing_values"]["email"], 0)
        self.assertEqual(
            payload["analysis"]["preview"][0]["email"],
            "unknown@example.com",
        )

    def test_clean_drop_missing_rows_removes_rows_missing_target_column(self):
        response = self.client.post(
            "/clean",
            files=self.make_csv_upload(
                "name,email\n"
                "Alice,\n"
                "Bob,bob@example.com\n"
                "Cara,\n"
            ),
            data={
                "action": "drop_missing_rows",
                "column": "email",
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()

        self.assertEqual(payload["analysis"]["rows"], 1)
        self.assertEqual(payload["analysis"]["missing_values"]["email"], 0)
        self.assertEqual(payload["analysis"]["preview"][0]["name"], "Bob")

    def test_clean_convert_datetime_changes_column_dtype(self):
        response = self.client.post(
            "/clean",
            files=self.make_csv_upload(
                "name,signup_date\n"
                "Alice,2024-01-15\n"
                "Bob,2024-02-03\n"
            ),
            data={
                "action": "convert_datetime",
                "column": "signup_date",
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()

        self.assertTrue(
            payload["analysis"]["dtypes"]["signup_date"].startswith("datetime64[")
        )
        self.assertIn(
            "Converted column 'signup_date' to datetime",
            payload["message"],
        )

    def test_clean_update_cell_coerces_numeric_value(self):
        response = self.client.post(
            "/clean",
            files=self.make_csv_upload(
                "name,age\n"
                "Alice,30\n"
                "Bob,25\n"
            ),
            data={
                "action": "update_cell",
                "column": "age",
                "row_index": "1",
                "value": "42",
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()

        self.assertEqual(payload["analysis"]["preview"][1]["age"], 42)
        self.assertIn("Updated row 2, column 'age'.", payload["message"])

    def test_clean_clear_cell_sets_value_to_null_in_preview(self):
        response = self.client.post(
            "/clean",
            files=self.make_csv_upload(
                "name,email\n"
                "Alice,alice@example.com\n"
                "Bob,bob@example.com\n"
            ),
            data={
                "action": "clear_cell",
                "column": "email",
                "row_index": "0",
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()

        self.assertEqual(payload["analysis"]["preview"][0]["email"], None)
        self.assertEqual(payload["analysis"]["missing_values"]["email"], 1)

    def test_clean_update_cell_rejects_invalid_numeric_value(self):
        response = self.client.post(
            "/clean",
            files=self.make_csv_upload(
                "name,age\n"
                "Alice,30\n"
                "Bob,25\n"
            ),
            data={
                "action": "update_cell",
                "column": "age",
                "row_index": "1",
                "value": "not-a-number",
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("not valid for numeric column", response.json()["detail"])

    def test_analyze_rejects_malformed_csv_upload(self):
        response = self.client.post(
            "/analyze",
            files=self.make_csv_upload('name,email\n"Alice,bad@example.com\n'),
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["detail"],
            "The uploaded file could not be parsed as CSV.",
        )

    def test_clean_rejects_missing_target_column(self):
        response = self.client.post(
            "/clean",
            files=self.make_csv_upload(
                "name,email\n"
                "Alice,alice@example.com\n"
            ),
            data={
                "action": "fill_missing_fixed",
                "column": "missing_column",
                "value": "x",
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["detail"],
            "Column 'missing_column' was not found.",
        )

    def test_clean_rejects_out_of_range_row_index(self):
        response = self.client.post(
            "/clean",
            files=self.make_csv_upload(
                "name,age\n"
                "Alice,30\n"
            ),
            data={
                "action": "update_cell",
                "column": "age",
                "row_index": "9",
                "value": "42",
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("out of range", response.json()["detail"])


if __name__ == "__main__":
    unittest.main()
