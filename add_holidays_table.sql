-- SQL for holidays table
CREATE TABLE holidays (
  id SERIAL PRIMARY KEY,
  department VARCHAR(255) NOT NULL,
  date DATE NOT NULL,
  type VARCHAR(20) NOT NULL, -- 'regular' or 'special'
  month INT NOT NULL,
  year INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Example index for fast lookup
CREATE INDEX idx_holidays_dept_month_year ON holidays(department, month, year);
