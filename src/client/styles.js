const style = document.createElement('style');
style.innerHTML = `
  table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 20px;
  }

  th, td {
    border: 1px solid #ddd;
    padding: 8px;
    text-align: left;
  }

  th {
    background-color: #a5a5a5;
  }

  #pagination button {
    margin: 5px;
    padding: 5px 10px;
    background-color: #007bff;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  #pagination button:disabled {
    background-color: #ccc;
    cursor: not-allowed;
  }
`;
document.head.appendChild(style);
