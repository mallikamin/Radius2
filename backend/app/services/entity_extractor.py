"""
Entity Extractor for ORBIT CRM Voice Query Pipeline.
Extracts project, block, unit, customer, price, date entities from text.
Ported from voice-agent — regex-only (no LLM for Phase 1).
"""
import re
import logging
from typing import Dict, Any, Optional, List
from decimal import Decimal
from datetime import date, timedelta

logger = logging.getLogger(__name__)


class ExtractedEntities:
    """Container for extracted entities."""
    def __init__(self):
        self.project = None
        self.block = None
        self.unit_number = None
        self.unit_type = None
        self.customer_name = None
        self.price_per_marla = None
        self.total_price = None
        self.area_marla = None
        self.date_range_start = None
        self.date_range_end = None
        self.transaction_number = None
        self.raw_entities = {}

    def to_dict(self):
        return {
            "project": self.project,
            "block": self.block,
            "unit_number": self.unit_number,
            "unit_type": self.unit_type,
            "customer_name": self.customer_name,
            "raw_entities": self.raw_entities,
        }


class EntityExtractor:
    """Extract entities from text using regex patterns and fuzzy matching."""

    PROJECT_NAMES = ["Sitara Villas", "Sitara Park City", "Sitara Square", "Riaz ul Jannah"]

    PROJECT_ALIASES = {
        "sitara villas": "Sitara Villas", "sitara villa": "Sitara Villas",
        "sitara vilas": "Sitara Villas", "sv": "Sitara Villas",
        "sitara park city": "Sitara Park City", "sitara park": "Sitara Park City",
        "spc": "Sitara Park City", "park city": "Sitara Park City",
        "sitara square": "Sitara Square", "ss": "Sitara Square",
        "riaz ul jannah": "Riaz ul Jannah", "riaz-ul-jannah": "Riaz ul Jannah",
        "ruj": "Riaz ul Jannah", "riazuljannah": "Riaz ul Jannah",
    }

    PATTERNS = {
        'unit_number': [
            r'(?:plot|unit|flat|shop|house|ghar)[\s#\-\.]*(\d+)',
            r'#\s*(\d+)',
            r'number\s*(\d+)',
            r'(\d+)\s*(?:number)\s*(?:wala|wali|ka|ki|plot|unit)?',
            r'(\d+)\s*(?:plot|unit|flat|shop)',
            r'(?:plot|unit).*?(\d+)',
        ],
        'block': [
            r'block[\s\-\.]*([A-Za-z0-9\-]+)',
            r'\b([A-Z]{1,2}\-?\d+)\b',
            r'([A-Z])\s*(?:block)',
        ],
        'price_per_marla': [
            r'(\d[\d,\.]*)\s*(?:PKR|Rs\.?|rupees?)?\s*(?:per\s*marla|/\s*marla)',
            r'(?:per\s*marla|/\s*marla)\s*(\d[\d,\.]*)',
        ],
        'total_price': [
            r'(?:total|amount|price)\s*(?:is\s*)?(?:PKR|Rs\.?)?\s*(\d[\d,\.]*)',
            r'(\d[\d,\.]*)\s*(?:total|amount)',
        ],
        'area_marla': [r'(\d+(?:\.\d+)?)\s*(?:marla)'],
        'transaction_number': [
            r'(?:transaction|txn|trx)[\s#\-]*(\w+\-?\d+)',
            r'TXN\-(\d+)',
        ],
    }

    PRICE_MULTIPLIERS = {
        'lakh': 100000, 'lac': 100000, 'lakhs': 100000, 'lacs': 100000,
        'crore': 10000000, 'crores': 10000000, 'cr': 10000000,
        'million': 1000000, 'm': 1000000, 'k': 1000, 'thousand': 1000,
    }

    STOP_WORDS = {
        'the', 'our', 'is', 'are', 'what', 'which', 'show', 'me',
        'give', 'get', 'find', 'list', 'all', 'for', 'from', 'wise', 'report',
        'sales', 'customer', 'broker', 'contact', 'phone', 'number', 'details',
        'please', 'can', 'you', 'i', 'want', 'need', 'see', 'view', 'display',
        'total', 'summary', 'block', 'project', 'unit', 'plot', 'available'
    }

    def extract(self, text: str) -> ExtractedEntities:
        normalized = " ".join(text.split())
        entities = ExtractedEntities()

        # Project
        project = self._extract_project(normalized)
        if project:
            entities.project = project
            entities.raw_entities["project"] = project

        # Block
        block = self._extract_block(normalized)
        if block:
            entities.block = block
            entities.raw_entities["block"] = block

        # Unit number
        unit = self._extract_pattern(normalized, 'unit_number')
        if unit:
            entities.unit_number = unit
            entities.raw_entities["unit_number"] = unit

        # Prices
        price_per_marla = self._extract_price(normalized, 'price_per_marla')
        if price_per_marla:
            entities.price_per_marla = price_per_marla
            entities.raw_entities["price_per_marla"] = str(price_per_marla)

        total_price = self._extract_price(normalized, 'total_price')
        if total_price:
            entities.total_price = total_price
            entities.raw_entities["total_price"] = str(total_price)

        # Area
        area = self._extract_pattern(normalized, 'area_marla')
        if area:
            try:
                entities.area_marla = Decimal(area)
                entities.raw_entities["area_marla"] = area
            except Exception:
                pass

        # Transaction number
        txn = self._extract_pattern(normalized, 'transaction_number')
        if txn:
            entities.transaction_number = txn
            entities.raw_entities["transaction_number"] = txn

        # Date range
        date_range = self._extract_date_range(normalized)
        if date_range:
            entities.date_range_start = date_range[0]
            entities.date_range_end = date_range[1]
            entities.raw_entities["date_range"] = f"{date_range[0]} to {date_range[1]}"

        # Unit type
        unit_type = self._extract_unit_type(normalized)
        if unit_type:
            entities.unit_type = unit_type
            entities.raw_entities["unit_type"] = unit_type

        # Customer name
        customer_name = self._extract_person_name(normalized, "customer")
        if customer_name:
            entities.customer_name = customer_name
            entities.raw_entities["customer_name"] = customer_name

        # Broker name
        broker_name = self._extract_person_name(normalized, "broker")
        if broker_name:
            entities.raw_entities["broker_name"] = broker_name

        # Inventory status
        status = self._extract_inventory_status(normalized)
        if status:
            entities.raw_entities["inventory_status"] = status

        return entities

    def _extract_project(self, text: str) -> Optional[str]:
        text_lower = text.lower()
        for alias, project in self.PROJECT_ALIASES.items():
            if alias in text_lower:
                return project
        for project in self.PROJECT_NAMES:
            if project.lower() in text_lower:
                return project
        try:
            from rapidfuzz import fuzz
            words = text.split()
            for i in range(len(words)):
                for j in range(i + 1, min(i + 4, len(words) + 1)):
                    phrase = " ".join(words[i:j])
                    for project in self.PROJECT_NAMES:
                        score = fuzz.ratio(phrase.lower(), project.lower())
                        if score > 80:
                            return project
        except ImportError:
            pass
        return None

    def _extract_block(self, text: str) -> Optional[str]:
        block_stop_words = {'wise', 'report', 'list', 'all', 'total', 'summary', 'details'}
        for pattern in self.PATTERNS['block']:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                block = match.group(1).strip()
                if block.lower() in block_stop_words:
                    continue
                return block.upper() if len(block) <= 4 else block.title()
        return None

    def _extract_pattern(self, text: str, pattern_name: str) -> Optional[str]:
        patterns = self.PATTERNS.get(pattern_name, [])
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(1).strip()
        return None

    def _extract_price(self, text: str, pattern_name: str) -> Optional[Decimal]:
        raw_value = self._extract_pattern(text, pattern_name)
        if not raw_value:
            return None
        try:
            clean_value = raw_value.replace(",", "").replace(" ", "")
            text_lower = text.lower()
            multiplier = 1
            for mult_word, mult_value in self.PRICE_MULTIPLIERS.items():
                if mult_word in text_lower:
                    multiplier = mult_value
                    break
            return Decimal(clean_value) * multiplier
        except Exception as e:
            logger.warning(f"Failed to parse price '{raw_value}': {e}")
            return None

    def _extract_date_range(self, text: str) -> Optional[tuple]:
        text_lower = text.lower()
        today = date.today()
        if "current month" in text_lower or "this month" in text_lower:
            start = today.replace(day=1)
            if today.month == 12:
                end = today.replace(year=today.year + 1, month=1, day=1) - timedelta(days=1)
            else:
                end = today.replace(month=today.month + 1, day=1) - timedelta(days=1)
            return (start, end)
        if "last month" in text_lower or "previous month" in text_lower:
            first_of_this_month = today.replace(day=1)
            end = first_of_this_month - timedelta(days=1)
            start = end.replace(day=1)
            return (start, end)
        if "this year" in text_lower or "current year" in text_lower:
            start = today.replace(month=1, day=1)
            end = today.replace(month=12, day=31)
            return (start, end)
        return None

    def _extract_unit_type(self, text: str) -> Optional[str]:
        text_lower = text.lower()
        unit_types = {
            'plot': ['plot'], 'flat': ['flat', 'apartment'],
            'shop': ['shop'], 'house': ['house', 'home'],
            'office': ['office'],
        }
        for unit_type, keywords in unit_types.items():
            for keyword in keywords:
                if keyword in text_lower:
                    return unit_type
        return None

    def _extract_person_name(self, text: str, person_type: str) -> Optional[str]:
        text_lower = text.lower()
        report_indicators = ['wise', 'report', 'summary', 'list all', 'show all', 'total']
        if any(indicator in text_lower for indicator in report_indicators):
            return None

        if person_type == "customer":
            patterns = [
                r'(?:customer|buyer|client|owner)\s+(?:named?\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)',
                r'(?:contact|phone|number)\s+(?:of|for)\s+(?:customer\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)',
            ]
        else:
            patterns = [
                r'(?:broker|agent|dealer)\s+(?:named?\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)',
                r'(?:contact|phone|number)\s+(?:of|for)\s+(?:broker\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)',
            ]

        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                name = match.group(1).strip()
                name_words = name.lower().split()
                if name and len(name) > 2 and not any(word in self.STOP_WORDS for word in name_words):
                    return name.title()
        return None

    def _extract_inventory_status(self, text: str) -> Optional[str]:
        text_lower = text.lower()
        status_keywords = {
            'available': ['available', 'unsold', 'vacant', 'free', 'khali'],
            'sold': ['sold', 'becha', 'bik gaya'],
            'reserved': ['booked', 'reserved', 'hold'],
        }
        for status, keywords in status_keywords.items():
            for keyword in keywords:
                if keyword in text_lower:
                    return status
        return None

    def set_projects(self, projects: List[str]):
        self.PROJECT_NAMES = projects


entity_extractor = EntityExtractor()
