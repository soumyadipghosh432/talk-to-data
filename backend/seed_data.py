import os
import random
import datetime
from dotenv import load_dotenv
import psycopg2
import bcrypt

# Load environment variables
dotenv_path = os.path.join(os.path.dirname(__file__), '.env')
if os.path.exists(dotenv_path):
    load_dotenv(dotenv_path)
else:
    load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

def get_connection():
    print(f"Connecting to database at: {DATABASE_URL}")
    return psycopg2.connect(DATABASE_URL)

def run_init_sql(cursor):
    init_sql_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'init.sql')
    print(f"Loading schema from {init_sql_path}...")
    with open(init_sql_path, 'r', encoding='utf-8') as f:
        sql = f.read()
    
    # Split by semicolon to execute queries
    # Simple split since psycopg2 can execute multi-statement SQL as well
    cursor.execute(sql)
    print("Schema initialized successfully.")

def seed_system_data(cursor):
    print("Seeding system users, roles, and rules...")
    
    # Generate password hashes
    admin_pw = bcrypt.hashpw(b"adminpassword", bcrypt.gensalt()).decode('utf-8')
    user_pw = bcrypt.hashpw(b"userpassword", bcrypt.gensalt()).decode('utf-8')
    
    # Insert users
    cursor.execute("""
        INSERT INTO users (user_name, password_hash, access_type)
        VALUES ('admin', %s, 'Admin'), ('user', %s, 'User')
        ON CONFLICT (user_name) DO UPDATE 
        SET password_hash = EXCLUDED.password_hash, access_type = EXCLUDED.access_type
        RETURNING user_id, user_name;
    """, (admin_pw, user_pw))
    users = cursor.fetchall()
    user_map = {name: uid for uid, name in users}
    
    # Insert Roles
    cursor.execute("""
        INSERT INTO roles (role_name, description)
        VALUES 
            ('US_Sales_Agent', 'Restricted to US geographic region sales'),
            ('EMEA_Sales_Agent', 'Restricted to EMEA geographic region sales'),
            ('APAC_Sales_Agent', 'Restricted to APAC geographic region sales')
        ON CONFLICT (role_name) DO UPDATE SET description = EXCLUDED.description
        RETURNING role_id, role_name;
    """)
    roles = cursor.fetchall()
    role_map = {name: rid for rid, name in roles}
    
    # Insert Rules (sql_predicate)
    # The predicate must be applied to queries, e.g. "geographic_region = 'US'"
    cursor.execute("""
        INSERT INTO rules (rule_name, description, sql_predicate)
        VALUES 
            ('US_Only', 'Isolates rows to US region', 'geographic_region = ''US'''),
            ('EMEA_Only', 'Isolates rows to EMEA region', 'geographic_region = ''EMEA'''),
            ('APAC_Only', 'Isolates rows to APAC region', 'geographic_region = ''APAC''')
        ON CONFLICT (rule_name) DO UPDATE SET sql_predicate = EXCLUDED.sql_predicate
        RETURNING rule_id, rule_name;
    """)
    rules = cursor.fetchall()
    rule_map = {name: rid for rid, name in rules}
    
    # Insert Role Rules Mapping
    role_rules = [
        (role_map['US_Sales_Agent'], rule_map['US_Only']),
        (role_map['EMEA_Sales_Agent'], rule_map['EMEA_Only']),
        (role_map['APAC_Sales_Agent'], rule_map['APAC_Only'])
    ]
    for rid, ruid in role_rules:
        cursor.execute("""
            INSERT INTO role_rules_mapping (role_id, rule_id)
            VALUES (%s, %s)
            ON CONFLICT DO NOTHING;
        """, (rid, ruid))
        
    # Map 'user' to 'US_Sales_Agent' role so row-level constraints apply by default
    if 'user' in user_map and 'US_Sales_Agent' in role_map:
        cursor.execute("""
            INSERT INTO user_roles_mapping (user_id, role_id)
            VALUES (%s, %s)
            ON CONFLICT DO NOTHING;
        """, (user_map['user'], role_map['US_Sales_Agent']))

def seed_business_data(cursor):
    print("Checking business tables...")
    cursor.execute("SELECT COUNT(*) FROM customers;")
    customer_count = cursor.fetchone()[0]
    
    if customer_count > 0:
        print(f"Business data already seeded ({customer_count} customers). Skipping business data seeding.")
        return
        
    print("Generating business data...")
    
    # 1. Customers (at least 50 records)
    first_names = ["James", "Mary", "John", "Patricia", "Robert", "Jennifer", "Michael", "Linda", "William", "Elizabeth",
                   "David", "Barbara", "Richard", "Susan", "Joseph", "Jessica", "Thomas", "Sarah", "Charles", "Karen",
                   "Christopher", "Nancy", "Daniel", "Lisa", "Matthew", "Betty", "Anthony", "Margaret", "Mark", "Sandra"]
    last_names = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez",
                  "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin"]
    
    regions = ["US", "EMEA", "APAC"]
    statuses = ["Active", "Active", "Active", "Inactive"] # 75% active
    
    customers_data = []
    emails = set()
    
    for i in range(70): # Create 70 customers
        fn = random.choice(first_names)
        ln = random.choice(last_names)
        email = f"{fn.lower()}.{ln.lower()}{random.randint(10, 99)}@example.com"
        while email in emails:
            email = f"{fn.lower()}.{ln.lower()}{random.randint(100, 999)}@example.com"
        emails.add(email)
        
        region = random.choice(regions)
        # Registration dates spread over last 90 days
        reg_days_ago = random.randint(0, 90)
        reg_date = datetime.date.today() - datetime.timedelta(days=reg_days_ago)
        status = random.choice(statuses)
        
        cursor.execute("""
            INSERT INTO customers (first_name, last_name, email, geographic_region, registration_date, status)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING customer_id, geographic_region;
        """, (fn, ln, email, region, reg_date, status))
        res = cursor.fetchone()
        customers_data.append({"id": res[0], "region": res[1]})
        
    print(f"Seeded {len(customers_data)} customers.")
    
    # 2. Products (at least 50 records)
    categories_products = {
        "Electronics": [
            ("Quantum Laptop", 1299.99), ("Pro Tablet 10", 499.50), ("NoiseCanceling Headphones", 199.99),
            ("Smart Watch v4", 249.99), ("4K Ultra Monitor 32", 349.99), ("Mechanical Keyboard", 89.99),
            ("Wireless Ergonomic Mouse", 49.99), ("HD Web Camera", 79.99), ("USB-C Triple Docking Station", 129.99),
            ("External SSD 2TB", 159.99), ("Smart Speaker Hub", 99.00), ("Smart RGB Bulb Pack", 39.99),
            ("Wireless Charger Pad", 29.99), ("VR Gaming headset", 399.99), ("Router Wi-Fi 6E", 149.99)
        ],
        "Apparel": [
            ("Classic Leather Jacket", 149.00), ("Running Sneakers Black", 89.99), ("Merino Wool Sweater", 79.50),
            ("Premium Denim Jeans", 59.99), ("Performance Athletic Tee", 24.99), ("Waterproof Winter Parka", 199.00),
            ("Classic Sunglasses", 35.00), ("Canvas Travel Duffel", 65.00), ("Thermal Compression Tights", 39.99),
            ("Casual Slip-On Shoes", 49.99), ("Structured Cap", 19.99), ("Bamboo Socks (5-pack)", 18.50)
        ],
        "Home Office": [
            ("Ergonomic Mesh Chair", 279.99), ("Electric Standing Desk", 399.99), ("LED Desk Lamp (Dimmable)", 34.50),
            ("Dual Monitor Mount Arms", 69.99), ("Leather Desk Writing Pad", 29.99), ("Desktop Organizer Rack", 24.99),
            ("Memory Foam Seat Cushion", 39.99), ("Magnetic Whiteboard", 45.00), ("Acoustic Desk Privacy Screen", 89.99),
            ("Cable Management Kit", 19.99), ("Under Desk Footrest", 29.99), ("Faux Succulent Trio", 15.99)
        ],
        "Fitness & Outdoors": [
            ("Stainless Steel Flask 32oz", 24.99), ("Non-Slip Yoga Mat 6mm", 29.99), ("Adjustable Dumbbell Set", 229.00),
            ("Resistance Bands Kit", 18.99), ("Smart Body Fat Scale", 39.99), ("Camping Dome Tent 4P", 119.50),
            ("Compact Hiking Backpack", 55.00), ("Lightweight Sleeping Bag", 45.00), ("Self-Inflating Air Mattress", 39.99),
            ("Trekking Pole Pair", 34.99), ("Rechargeable Headlamp", 21.99), ("Folding Camping Chair", 29.99)
        ]
    }
    
    products_data = []
    for category, prod_list in categories_products.items():
        for name, price in prod_list:
            stock = random.randint(10, 200)
            cursor.execute("""
                INSERT INTO products (product_name, category, price, stock_quantity)
                VALUES (%s, %s, %s, %s)
                RETURNING product_id, price;
            """, (name, category, price, stock))
            res = cursor.fetchone()
            products_data.append({"id": res[0], "price": float(res[1])})
            
    print(f"Seeded {len(products_data)} products.")
    
    # 3. Orders & Order Items (at least 50 orders)
    order_statuses = ["Completed", "Completed", "Completed", "Pending", "Cancelled"] # 60% completed
    
    order_id_counter = 1
    total_orders = 85
    
    for _ in range(total_orders):
        customer = random.choice(customers_data)
        cid = customer["id"]
        region = customer["region"]
        
        # Order Date over the last 60 days
        order_days_ago = random.randint(0, 60)
        order_date = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=order_days_ago, hours=random.randint(0, 23), minutes=random.randint(0, 59))
        status = random.choice(order_statuses)
        
        # Create order first, total_amount defaults to 0
        cursor.execute("""
            INSERT INTO orders (customer_id, order_date, status, geographic_region, total_amount)
            VALUES (%s, %s, %s, %s, 0.00)
            RETURNING order_id;
        """, (cid, order_date, status, region))
        oid = cursor.fetchone()[0]
        
        # 4. Order Items (1 to 4 items per order)
        num_items = random.randint(1, 4)
        selected_products = random.sample(products_data, num_items)
        order_total = 0.00
        
        for prod in selected_products:
            pid = prod["id"]
            price = prod["price"]
            qty = random.randint(1, 3)
            item_total = price * qty
            order_total += item_total
            
            cursor.execute("""
                INSERT INTO order_items (order_id, product_id, quantity, unit_price)
                VALUES (%s, %s, %s, %s);
            """, (oid, pid, qty, price))
            
        # Update order total_amount
        cursor.execute("""
            UPDATE orders
            SET total_amount = %s
            WHERE order_id = %s;
        """, (order_total, oid))
        
    print(f"Seeded {total_orders} orders with corresponding order items.")
    
    # 5. Reviews (at least 50 records)
    review_comments_good = [
        "Absolutely amazing! Highly recommend.", "Very satisfied with this purchase.", 
        "Exceeded expectations, super build quality.", "Great value for money.", 
        "Works perfectly and looks great.", "Fast shipping, item is top notch."
    ]
    review_comments_mid = [
        "It is decent, but has a few minor issues.", "Decent quality for the price.", 
        "Average performance, nothing extraordinary.", "Does the job, but could be better.", 
        "Okay product, shipping took longer than expected."
    ]
    review_comments_bad = [
        "Extremely disappointed. Do not buy.", "Poor quality and stopped working after a week.", 
        "Not worth the money.", "Came damaged, requested a refund.", 
        "Terrible customer service and bad design."
    ]
    
    total_reviews = 60
    for _ in range(total_reviews):
        customer = random.choice(customers_data)
        product = random.choice(products_data)
        
        rating = random.choices([5, 4, 3, 2, 1], weights=[45, 25, 15, 10, 5])[0]
        if rating >= 4:
            comment = random.choice(review_comments_good)
        elif rating == 3:
            comment = random.choice(review_comments_mid)
        else:
            comment = random.choice(review_comments_bad)
            
        review_days_ago = random.randint(0, 30)
        review_date = datetime.date.today() - datetime.timedelta(days=review_days_ago)
        
        cursor.execute("""
            INSERT INTO reviews (product_id, customer_id, rating, review_text, review_date)
            VALUES (%s, %s, %s, %s, %s);
        """, (product["id"], customer["id"], rating, comment, review_date))
        
    print(f"Seeded {total_reviews} reviews.")

def main():
    conn = None
    try:
        conn = get_connection()
        conn.autocommit = False
        cursor = conn.cursor()
        
        # Run init schema
        run_init_sql(cursor)
        
        # Seed system schema
        seed_system_data(cursor)
        
        # Seed business schemas
        seed_business_data(cursor)
        
        conn.commit()
        print("Database seeding completed successfully!")
        
    except Exception as e:
        if conn:
            conn.rollback()
        print(f"Seeding failed: {e}")
        raise e
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    main()
