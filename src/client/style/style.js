const style = document.createElement('style');
style.innerHTML = `
body {
  font-family: Arial, sans-serif;
  background-color: #1a1a1a;
  color: #e0e0e0;
  margin: 0;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
}

/* App Container */
#app {
  text-align: center;
  max-width: 600px;
  width: 100%;
  padding: 20px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
}

/* Header */
header h1 {
  font-size: 2rem;
  margin-bottom: 5px;
}

header p {
  font-size: 1rem;
  color: #aaa;
}

/* Search Section */
#search-section {
  margin: 20px 0;
}

#gameIdInput {
  width: 70%;
  padding: 10px;
  font-size: 1rem;
  border: 1px solid #444;
  border-radius: 6px;
  background: #222;
  color: #fff;
}

#fetchButton {
  padding: 10px 15px;
  font-size: 1rem;
  background-color: #007bff;
  border: none;
  border-radius: 6px;
  color: white;
  cursor: pointer;
  transition: background 0.2s;
}

#fetchButton:hover {
  background-color: #0056b3;
}

/* Results Table */
table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 20px;
  background: #222;
  border-radius: 8px;
  overflow: hidden;
}

th, td {
  padding: 12px;
  border-bottom: 1px solid #444;
}

th {
  background-color: #007bff;
  color: white;
}

/* Pagination */
#pagination {
  margin-top: 15px;
}

#pagination button {
  margin: 5px;
  padding: 8px 12px;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

#pagination button:disabled {
  background-color: #444;
  cursor: not-allowed;
}
`;

document.head.appendChild(style);
