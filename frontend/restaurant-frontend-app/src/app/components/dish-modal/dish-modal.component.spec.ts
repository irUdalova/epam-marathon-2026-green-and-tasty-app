import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DishListResponse } from '@app/models/dishes/dish-list-response.model';

import { DishModalComponent } from './dish-modal.component';

// Values as the API sends them: with their units.
const DISH = {
  id: 'dish-1',
  name: 'Fresh Avocado Toast',
  description: 'Smashed avocado on toasted sourdough.',
  price: 12,
  weight: '200 g',
  imageUrl: 'toast.jpg',
  calories: '320 kcal',
  proteins: '8 g',
  fats: '18 g',
  carbohydrates: '30 g',
  vitamins: 'Vitamin C',
  state: 'Available',
  dishType: 'Appetizer',
} as DishListResponse;

describe('DishModalComponent', () => {
  let component: DishModalComponent;
  let fixture: ComponentFixture<DishModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DishModalComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DishModalComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('dish', DISH);
    fixture.detectChanges();
  });

  it('shows the dish name and description', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Fresh Avocado Toast');
    expect(text).toContain('Smashed avocado on toasted sourdough.');
  });

  it('shows the units the API sends once, not twice', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('320 kcal');
    expect(text).not.toContain('kcal kcal');
    expect(text).toContain('18 g');
    expect(text).not.toContain('18 gg');
  });

  it('shows a dash for a missing value instead of leaving it blank', () => {
    fixture.componentRef.setInput('dish', { ...DISH, fats: '' });
    fixture.detectChanges();
    const fats = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.dish-info p')].find((line) =>
      line.textContent?.includes('Fats:'),
    );
    expect(fats?.textContent?.trim()).toBe('Fats: —');
  });

  it('× emits closed', () => {
    let closed = 0;
    component.closed.subscribe(() => closed++);
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.close-button')!.click();
    expect(closed).toBe(1);
  });
});
