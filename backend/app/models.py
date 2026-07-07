import uuid
from sqlalchemy import Table, Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Numeric, Date, func
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.database import Base

# Association Table: Role <-> Rule
role_rules_mapping = Table(
    'role_rules_mapping',
    Base.metadata,
    Column('role_id', Integer, ForeignKey('roles.role_id', ondelete='CASCADE'), primary_key=True),
    Column('rule_id', Integer, ForeignKey('rules.rule_id', ondelete='CASCADE'), primary_key=True)
)

# Association Table: User <-> Role
user_roles_mapping = Table(
    'user_roles_mapping',
    Base.metadata,
    Column('user_id', Integer, ForeignKey('users.user_id', ondelete='CASCADE'), primary_key=True),
    Column('role_id', Integer, ForeignKey('roles.role_id', ondelete='CASCADE'), primary_key=True)
)

class User(Base):
    __tablename__ = 'users'
    
    user_id = Column(Integer, primary_key=True, index=True)
    user_name = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=True) # Nullable for SSO
    access_type = Column(String(50), default='User', nullable=False) # 'User' or 'Admin'
    created_at = Column(DateTime(timezone=True), default=func.now())
    
    # Relationships
    roles = relationship('Role', secondary=user_roles_mapping, back_populates='users')
    chats = relationship('ChatHistory', back_populates='user', cascade='all, delete-orphan')

class Rule(Base):
    __tablename__ = 'rules'
    
    rule_id = Column(Integer, primary_key=True, index=True)
    rule_name = Column(String(100), unique=True, nullable=False)
    description = Column(Text, nullable=True)
    sql_predicate = Column(Text, nullable=False) # e.g. "geographic_region = 'US'"
    
    roles = relationship('Role', secondary=role_rules_mapping, back_populates='rules')

class Role(Base):
    __tablename__ = 'roles'
    
    role_id = Column(Integer, primary_key=True, index=True)
    role_name = Column(String(100), unique=True, nullable=False)
    description = Column(Text, nullable=True)
    
    # Relationships
    rules = relationship('Rule', secondary=role_rules_mapping, back_populates='roles')
    users = relationship('User', secondary=user_roles_mapping, back_populates='roles')

class ChatHistory(Base):
    __tablename__ = 'chat_history'
    
    chat_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(Integer, ForeignKey('users.user_id', ondelete='CASCADE'), nullable=False)
    title = Column(String(255), nullable=False)
    history_data = Column(JSONB, default=list, nullable=False) # [{"role": "user", "content": "..."}, ...]
    updated_at = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
    
    # Relationships
    user = relationship('User', back_populates='chats')
    feedbacks = relationship('Feedback', back_populates='chat', cascade='all, delete-orphan')

class Feedback(Base):
    __tablename__ = 'feedback'
    
    feedback_id = Column(Integer, primary_key=True, index=True)
    chat_id = Column(UUID(as_uuid=True), ForeignKey('chat_history.chat_id', ondelete='CASCADE'), nullable=False)
    thumbs_up = Column(Boolean, default=False, nullable=False)
    thumbs_down = Column(Boolean, default=False, nullable=False)
    user_question = Column(Text, nullable=False)
    ai_response = Column(Text, nullable=False)
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=func.now())
    
    # Relationships
    chat = relationship('ChatHistory', back_populates='feedbacks')

class ExecutionLog(Base):
    __tablename__ = 'execution_log'
    
    log_id = Column(Integer, primary_key=True, index=True)
    chat_id = Column(UUID(as_uuid=True), nullable=True)
    user_id = Column(Integer, nullable=True)
    prompt_tokens = Column(Integer, default=0)
    completion_tokens = Column(Integer, default=0)
    total_tokens = Column(Integer, default=0)
    latency_ms = Column(Integer, nullable=False)
    throughput_tps = Column(Numeric(10, 2), nullable=True)
    llm_provider_utilized = Column(String(100), nullable=False)
    generated_sql_statement = Column(Text, nullable=True)
    execution_status = Column(String(50), nullable=False) # 'SUCCESS', 'GUARDRAIL_DENIED', 'SQL_ERROR'
    recorded_at = Column(DateTime(timezone=True), default=func.now())


# Business Tables (represented for ORM completeness)
class Customer(Base):
    __tablename__ = 'customers'
    
    customer_id = Column(Integer, primary_key=True, index=True)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    geographic_region = Column(String(50), nullable=False)
    registration_date = Column(Date, default=func.current_date(), nullable=False)
    status = Column(String(50), default='Active', nullable=False)
    
    orders = relationship('Order', back_populates='customer', cascade='all, delete-orphan')

class Product(Base):
    __tablename__ = 'products'
    
    product_id = Column(Integer, primary_key=True, index=True)
    product_name = Column(String(255), nullable=False)
    category = Column(String(100), nullable=False)
    price = Column(Numeric(10, 2), nullable=False)
    stock_quantity = Column(Integer, nullable=False)
    
    order_items = relationship('OrderItem', back_populates='product', cascade='all, delete-orphan')

class Order(Base):
    __tablename__ = 'orders'
    
    order_id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey('customers.customer_id', ondelete='CASCADE'), nullable=False)
    order_date = Column(DateTime(timezone=True), default=func.now(), nullable=False)
    status = Column(String(50), default='Pending', nullable=False)
    geographic_region = Column(String(50), nullable=False)
    total_amount = Column(Numeric(12, 2), default=0.00, nullable=False)
    
    customer = relationship('Customer', back_populates='orders')
    items = relationship('OrderItem', back_populates='order', cascade='all, delete-orphan')

class OrderItem(Base):
    __tablename__ = 'order_items'
    
    order_item_id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey('orders.order_id', ondelete='CASCADE'), nullable=False)
    product_id = Column(Integer, ForeignKey('products.product_id', ondelete='CASCADE'), nullable=False)
    quantity = Column(Integer, nullable=False)
    unit_price = Column(Numeric(10, 2), nullable=False)
    
    order = relationship('Order', back_populates='items')
    product = relationship('Product', back_populates='order_items')

class Review(Base):
    __tablename__ = 'reviews'
    
    review_id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey('products.product_id', ondelete='CASCADE'), nullable=False)
    customer_id = Column(Integer, ForeignKey('customers.customer_id', ondelete='CASCADE'), nullable=False)
    rating = Column(Integer, nullable=False)
    review_text = Column(Text, nullable=True)
    review_date = Column(Date, default=func.current_date(), nullable=False)
