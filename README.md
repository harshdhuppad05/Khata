<<<<<<< HEAD
# Khata
Simple Ledger to keep track of Accounts
=======
# Customer Dues Tracker

A small, local customer dues tracker for keeping track of bills, payments, and the balance for each customer.

## What it does

- Add customers with name and phone number.
- Add bills and payments against a customer.
- Automatically calculate each customer's balance.
- See total outstanding across all customers.
- Search and sort customers.
- Open a customer's ledger and see every entry.
- Edit or delete ledger entries.
- Edit customer details.
- Keep data locally in `data/data.json`.

## Run

1. Install Node.js 18 or newer.
2. Open a terminal in this folder.
3. Run:

```bash
npm start
```

4. Open `http://localhost:3000` in your browser.

The app has no external packages and no required database service. Your data stays in the `data/data.json` file beside the app.

## Data rule

A Bill increases the customer's balance.
A Payment decreases the customer's balance.

Example:

- Bill ₹12,500
- Payment ₹2,500
- Balance ₹10,000 to collect

A negative balance means the customer has paid more than the recorded bills, so it is shown as an advance.
>>>>>>> 8a30db7 (default project setup)
