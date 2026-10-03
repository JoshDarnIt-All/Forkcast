from typing import Optional
from pydantic import BaseModel, Field

CATEGORIES = ["breakfast", "lunch", "dinner", "snack", "dessert", "drink", "other"]
MEALS = ["breakfast", "lunch", "dinner", "snack"]


class ProfileIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    color: str = "#d1603d"


class IngredientIn(BaseModel):
    raw: str = ""
    quantity: Optional[float] = None
    unit: Optional[str] = None
    name: str = ""
    section: Optional[str] = None


class RecipeIn(BaseModel):
    title: str = Field(min_length=1)
    source_url: Optional[str] = None
    image_url: Optional[str] = None
    description: str = ""
    servings: Optional[int] = None
    prep_min: Optional[int] = None
    cook_min: Optional[int] = None
    total_min: Optional[int] = None
    category: str = "other"
    tags: list[str] = []
    favorite: bool = False
    notes: str = ""
    ingredients: list[IngredientIn] = []
    steps: list[str] = []


class ImportIn(BaseModel):
    url: Optional[str] = None
    text: Optional[str] = None
    html: Optional[str] = None  # optional page source (for sites that block servers)


class ShareIn(BaseModel):
    url: str
    html: Optional[str] = None


class PlanItemIn(BaseModel):
    recipe_id: int
    day: Optional[int] = Field(default=None, ge=0, le=6)
    meal: Optional[str] = None


class PlanItemPatch(BaseModel):
    day: Optional[int] = Field(default=None, ge=0, le=6)
    meal: Optional[str] = None
    servings_multiplier: Optional[float] = Field(default=None, gt=0, le=50)


class PlanSaveIn(BaseModel):
    name: str = "Meal plan"


class PlanPatch(BaseModel):
    name: str


class ShopPatch(BaseModel):
    checked: Optional[bool] = None
    owned: Optional[bool] = None
    name: Optional[str] = None
    quantity: Optional[float] = None


class ShopCustomIn(BaseModel):
    name: str = Field(min_length=1)
    quantity: Optional[float] = None
    unit: Optional[str] = None
    section: Optional[str] = None
