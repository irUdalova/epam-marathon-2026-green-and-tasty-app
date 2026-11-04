import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { API_BASE_URL } from '@app/shared/config/api-base-url.token';
import { MainPageComponent } from './main-page.component';

const BASE_URL = 'https://test.api';
const RISOTTO = {
  id: 'dish-1',
  name: 'Truffle Mushroom Risotto',
  description: 'Creamy arborio rice with wild mushrooms.',
  price: 22.5,
  weight: '350 g',
  imageUrl: 'risotto.jpg',
  calories: '620',
  proteins: '14 g',
  fats: '28',
  carbohydrates: '65 g',
  vitamins: 'Vitamin D',
  state: 'Available',
  dishType: 'Main course',
};

describe('MainPageComponent · popular dishes', () => {
  function create() {
    TestBed.configureTestingModule({
      imports: [MainPageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: API_BASE_URL, useValue: BASE_URL },
      ],
    });
    const fixture = TestBed.createComponent(MainPageComponent);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(`${BASE_URL}/dishes/popular`).flush([RISOTTO]);
    http.match(() => true).forEach((request) => request.flush([]));
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('a dish card is a button, not a link to a page that does not exist', () => {
    const { element } = create();
    const card = element.querySelector('.dish-card')!;
    expect(card.tagName).toBe('BUTTON');
    expect(card.getAttribute('href')).toBeNull();
  });

  it('clicking a card opens the dish window with its details', () => {
    const { fixture, element } = create();
    element.querySelector<HTMLButtonElement>('.dish-card')!.click();
    fixture.detectChanges();

    const modal = element.querySelector('app-dish-modal');
    expect(modal?.textContent).toContain('Truffle Mushroom Risotto');
    expect(modal?.textContent).toContain('Creamy arborio rice with wild mushrooms.');
  });

  it('× closes the dish window', () => {
    const { fixture, element } = create();
    element.querySelector<HTMLButtonElement>('.dish-card')!.click();
    fixture.detectChanges();

    element.querySelector<HTMLButtonElement>('app-dish-modal .close-button')!.click();
    fixture.detectChanges();

    expect(element.querySelector('app-dish-modal')).toBeNull();
  });
});
