SCHEMA_DDL = """
Tables in the `business` schema (search_path is set — do not schema-qualify):

customers(customer_id INT PK, name TEXT, city TEXT, state TEXT, join_date DATE)
products(product_id INT PK, product_name TEXT, category TEXT, price NUMERIC)
orders(order_id INT PK, customer_id INT FK -> customers, order_date DATE,
       total_amount NUMERIC, status TEXT)
order_items(order_item_id INT PK, order_id INT FK -> orders,
            product_id INT FK -> products, quantity INT, unit_price NUMERIC)

Notes:
- status is one of: 'pending', 'paid', 'shipped', 'delivered', 'cancelled'
- Order data spans the last ~180 days ending on the day the database was seeded.
- For relative time expressions in the user's question ("today", "this week",
  "this month", "last month"), use CURRENT_DATE as the anchor. Prefer
  date_trunc('week', CURRENT_DATE) for "this week" (ISO week, Monday-start),
  date_trunc('month', CURRENT_DATE) for "this month", and so on.
- When joining tables that share a column name (e.g. customers.customer_id and
  orders.customer_id, or orders.order_id and order_items.order_id), ALWAYS
  qualify the column with the table name in SELECT, WHERE, GROUP BY, and
  ORDER BY clauses. Unqualified references to shared columns cause
  "ambiguous column" errors.
- Use PostgreSQL 16 dialect. Prefer date_trunc(), generate_series(), NOW().
  Do NOT use MySQL syntax (backticks, LIMIT n,m).
""".strip()
