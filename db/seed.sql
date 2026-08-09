SET search_path TO business, public;

WITH names AS (
    SELECT
        ARRAY[
            'Aarav','Diya','Rohan','Priya','Aditya','Ananya','Kabir','Ishaan','Meera','Vihaan',
            'Sara','Arjun','Zara','Neel','Isha','Dev','Riya','Vivaan','Aisha','Rahul',
            'Tara','Yash','Nisha','Karan','Pooja','Aryan','Simran','Rehan','Nidhi','Manav',
            'Kavya','Advait','Anaya','Reyansh','Myra','Aarush','Kiara','Vivan','Anika','Shaurya'
        ]::text[] AS first_names,
        ARRAY[
            'Sharma','Patel','Iyer','Nair','Rao','Menon','Kapoor','Verma','Joshi','Reddy',
            'Khan','Malhotra','Ahmed','Bhatt','Desai','Chatterjee','Sen','Gupta','Siddiqui','Pillai',
            'Bose','Trivedi','Agarwal','Mehta','Shetty','Choudhary','Kaur','Ansari','Saxena','Ghosh',
            'Kumar','Singh','Das','Mishra','Pandey','Roy','Banerjee','Mukherjee','Chakraborty','Deshpande'
        ]::text[] AS last_names,
        ARRAY[
            'Mumbai','New Delhi','Bengaluru','Chennai','Hyderabad',
            'Kolkata','Pune','Ahmedabad','Jaipur','Lucknow',
            'Kanpur','Nagpur','Indore','Bhopal','Patna',
            'Vadodara','Ludhiana','Agra','Nashik','Surat',
            'Rajkot','Varanasi','Amritsar','Chandigarh','Ranchi',
            'Guwahati','Kochi','Coimbatore','Bhubaneswar','Mangaluru'
        ]::text[] AS cities,
        ARRAY[
            'MH','DL','KA','TN','TS',
            'WB','MH','GJ','RJ','UP',
            'UP','MH','MP','MP','BR',
            'GJ','PB','UP','MH','GJ',
            'GJ','UP','PB','CH','JH',
            'AS','KL','TN','OD','KA'
        ]::text[] AS states
)
INSERT INTO customers (name, city, state, join_date)
SELECT
    n.first_names[((i * 3) % 40) + 1] || ' ' || n.last_names[((i * 7) % 40) + 1],
    n.cities[((i * 11) % 30) + 1],
    n.states[((i * 11) % 30) + 1],
    (CURRENT_DATE - INTERVAL '2 years') + ((i * 4) % 700) * INTERVAL '1 day'
FROM names n, generate_series(1, 500) i;

WITH product_data AS (
    SELECT
        ARRAY['Electronics','Apparel','Home','Books','Fitness']::text[] AS categories,
        ARRAY[
            'Wireless Headphones','Smart Watch','Bluetooth Speaker','USB-C Cable','Laptop Stand',
            'Mechanical Keyboard','Wireless Mouse','Portable Charger','HD Webcam','Noise-Cancelling Earbuds',
            'Smart Bulb','HDMI Adapter','SSD 1TB','Tablet Stylus','Fitness Tracker',
            'Wireless Router','Phone Case','Screen Protector','Gaming Controller','LED Desk Lamp',
            'Cotton T-Shirt','Denim Jeans','Running Jacket','Hoodie','Polo Shirt',
            'Formal Shirt','Track Pants','Casual Shorts','Winter Coat','Sneakers',
            'Leather Belt','Cotton Socks','Baseball Cap','Wool Sweater','Rain Jacket',
            'Chino Trousers','Kurta','Saree','Silk Scarf','Linen Kurta',
            'Ceramic Mug Set','Table Lamp','Throw Blanket','Cotton Bed Sheet','Kitchen Towel Set',
            'Dinner Plate Set','Wall Clock','Decorative Vase','Photo Frame','Storage Basket',
            'Cushion Cover','Curtain Set','Bath Mat','Wooden Cutting Board','Non-Stick Pan',
            'Coffee Mug','Wine Glass Set','Salt and Pepper Shaker','Fruit Bowl','Table Runner',
            'Data Engineering Guide','SQL Cookbook','Python Deep Dive','Machine Learning Basics','React in Practice',
            'Clean Code','System Design Interview','Kubernetes Handbook','Docker Deep Dive','Building Microservices',
            'The Pragmatic Programmer','Effective Python','JavaScript Good Parts','Refactoring','Design Patterns',
            'The Mythical Man-Month','Code Complete','Peopleware','The Phoenix Project','Continuous Delivery',
            'Yoga Mat','Resistance Bands','Dumbbell 10lb','Dumbbell 25lb','Kettlebell 20lb',
            'Foam Roller','Jump Rope','Push-up Bars','Ab Wheel','Water Bottle',
            'Gym Bag','Massage Ball','Exercise Bike','Rowing Machine','Elliptical Trainer',
            'Adjustable Bench','Pull-up Bar','Weightlifting Belt','Yoga Blocks','Meditation Cushion'
        ]::text[] AS product_names
)
INSERT INTO products (product_name, category, price)
SELECT
    pd.product_names[i],
    pd.categories[((i - 1) / 20) + 1],
    round((10 + ((i * 17) % 200))::numeric + 0.99, 2)
FROM product_data pd, generate_series(1, 100) i;

WITH order_plan(cust_id, order_count) AS (
    SELECT
        i,
        CASE
            WHEN i <= 10  THEN 8
            WHEN i <= 30  THEN 5
            WHEN i <= 80  THEN 3
            WHEN i <= 200 THEN 2
            WHEN i <= 430 THEN 1
            ELSE 0
        END
    FROM generate_series(1, 500) i
)
INSERT INTO orders (customer_id, order_date, total_amount, status)
SELECT
    p.cust_id,
    (CURRENT_DATE - INTERVAL '180 days') + ((p.cust_id * 13 + n * 7) % 180) * INTERVAL '1 day',
    0,
    (ARRAY['delivered','delivered','delivered','delivered','delivered','delivered',
           'shipped','paid','pending','cancelled'])[((p.cust_id + n) % 10) + 1]
FROM order_plan p
CROSS JOIN LATERAL generate_series(1, p.order_count) AS n
WHERE p.order_count > 0;

WITH items AS (
    SELECT
        o.order_id,
        ((o.order_id + item_num * 3 - 1) % 100) + 1 AS product_id,
        ((o.order_id + item_num) % 3) + 1          AS quantity
    FROM orders o
    CROSS JOIN LATERAL generate_series(1, ((o.order_id % 4) + 1)) AS item_num
)
INSERT INTO order_items (order_id, product_id, quantity, unit_price)
SELECT i.order_id, i.product_id, i.quantity, p.price
FROM items i
JOIN products p ON p.product_id = i.product_id;

UPDATE orders o
SET total_amount = COALESCE((
    SELECT SUM(oi.quantity * oi.unit_price)
    FROM order_items oi
    WHERE oi.order_id = o.order_id
), 0);
