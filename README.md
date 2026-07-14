# Smart Mini-Ledger

A lightweight full-stack expense tracking application with intelligent anomaly detection and configurable notifications.

---

## Overview

Smart Mini-Ledger is a full-stack expense tracking application developed as part of the Bytex Fresher Challenge.

The application helps users efficiently manage income and expenses while automatically detecting unusual spending patterns using statistical anomaly detection.

It provides a clean and responsive interface with real-time financial summaries, category-wise analytics, transaction management, CSV export, webhook notifications, and dark mode support.

## Features

- Add income and expense transactions
- Edit transactions
- Delete transactions
- Search transactions
- Sort transactions
- Live income, expense and balance summary
- Category-wise expense chart
- Intelligent anomaly detection
- In-app notifications
- Discord/Slack webhook support
- CSV export
- Dark mode
- Responsive user interface

## Tech Stack

### Frontend

- HTML5
- CSS3
- JavaScript (Vanilla)
- Chart.js

### Backend

- Python
- Flask
- SQLite

### Tools

- Git
- GitHub

## Installation

Clone the repository

```bash
git clone https://github.com/Nithya200505/Smart-Mini-Ledger.git
```

Navigate to the project folder

```bash
cd Smart-Mini-Ledger
```

Install dependencies

```bash
pip install -r requirements.txt
```

Run the application

```bash
python app.py
```

Open your browser and visit:

```
http://localhost:5000
```
## Intelligent Anomaly Detection

The application detects unusual expenses using statistical analysis.

- Uses category-wise historical spending data.
- Calculates anomalies using the Z-score method.
- Handles cold-start scenarios with median-based comparison.
- Flagged transactions receive visual indicators and notifications.

## AI Usage Disclosure

### AI Tools Used

This project was developed with assistance from ChatGPT for brainstorming ideas, improving the user interface, debugging issues, refining backend logic, and enhancing overall project quality.

### My Contributions

I independently implemented and improved several parts of the project, including:

- Edit and Delete transaction functionality
- Search and Sort features
- CSV Export
- Dark Mode
- Toast Notifications
- Delete Confirmation Modal
- Improved form validation
- User interface enhancements
- Bug fixes and testing

The final application reflects my own debugging, customization, testing, and refinement beyond the AI-assisted suggestions.

## Future Enhancements

- User authentication
- Monthly expense reports
- Budget planning
- PDF report generation
- Cloud deployment
- Mobile-friendly improvements

## Author

**Narayandas Nithyasri**

GitHub:
https://github.com/Nithya200505
