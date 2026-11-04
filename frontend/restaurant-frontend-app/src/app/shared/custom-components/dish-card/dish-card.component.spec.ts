import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DishCardComponent } from './dish-card.component';
import { DishListResponse } from '@app/models/dishes/dish-list-response.model';
import { DishState } from '@app/models/enums/dish-state.model';

describe('DishCardComponent', () => {
  let component: DishCardComponent;
  let fixture: ComponentFixture<DishCardComponent>;

  const dish: DishListResponse = {
    id: 'dish-1',
    name: 'Khachapuri',
    imageUrl: 'assets/img/dish.png',
    price: 15,
    state: DishState.Available,
    weight: '350',
    dishType: 'MainCourse',
    description: 'Georgian cheese bread',
    calories: '500',
    proteins: '20',
    carbohydrates: '45',
    fats: '25',
    vitamins: 'A, B',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DishCardComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DishCardComponent);
    component = fixture.componentInstance;

    fixture.componentRef.setInput('dish', dish);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('pointer cursor', () => {
    function card(): HTMLElement {
      return (fixture.nativeElement as HTMLElement).querySelector('.dish-card')!;
    }

    it('an available dish is clickable and opens its details', () => {
      let clicked = 0;
      component.dishClicked.subscribe(() => clicked++);

      expect(card().classList).toContain('clickable');
      card().click();
      expect(clicked).toBe(1);
    });

    it('not in pre-order mode, where only the Pre-Order button acts', () => {
      fixture.componentRef.setInput('preOrderEnabled', true);
      fixture.detectChanges();
      expect(card().classList).not.toContain('clickable');
    });

    it('not for an unavailable dish', () => {
      fixture.componentRef.setInput('dish', { ...dish, state: DishState.OnStop });
      fixture.detectChanges();
      expect(card().classList).not.toContain('clickable');
    });
  });
});
