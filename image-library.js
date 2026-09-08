/* Встроенные обложки и подборка фотографий. Интернет-поиск не имитируется. */
(function (root) {
    'use strict';
    const items = [
  {
    "url": "assets/images/cover-career.svg",
    "title": "Новые горизонты",
    "category": "career",
    "tags": "карьера бизнес работа офис команда стартап career tech",
    "local": true
  },
  {
    "url": "assets/images/cover-wealth.svg",
    "title": "Тихий достаток",
    "category": "wealth",
    "tags": "деньги богатство финансы достаток свобода wealth money",
    "local": true
  },
  {
    "url": "assets/images/cover-health.svg",
    "title": "Внутреннее равновесие",
    "category": "health",
    "tags": "здоровье спорт йога медитация дыхание природа health",
    "local": true
  },
  {
    "url": "assets/images/cover-travel.svg",
    "title": "За горизонт",
    "category": "travel",
    "tags": "путешествия море океан горы отпуск отдых travel ocean sea",
    "local": true
  },
  {
    "url": "assets/images/cover-relationships.svg",
    "title": "Быть рядом",
    "category": "relationships",
    "tags": "любовь семья отношения близость вместе relationships love",
    "local": true
  },
  {
    "url": "assets/images/cover-growth.svg",
    "title": "Расти и раскрыться",
    "category": "growth",
    "tags": "рост хобби творчество обучение книга вдохновение growth art",
    "local": true
  },
  {
    "url": "assets/images/dream_career.png",
    "title": "Место для больших идей",
    "category": "career",
    "tags": "карьера бизнес работа офис команда стартап career tech",
    "local": true
  },
  {
    "url": "assets/images/dream_travel.png",
    "title": "Дом у океана",
    "category": "travel",
    "tags": "путешествия море океан горы отпуск отдых travel ocean sea дом вилла",
    "local": true
  },
  {
    "url": "https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800",
    "title": "Команда мечты",
    "category": "career",
    "tags": "карьера бизнес работа офис команда стартап career tech",
    "local": false
  },
  {
    "url": "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=800",
    "title": "Рабочее пространство",
    "category": "career",
    "tags": "карьера бизнес работа офис команда стартап career tech",
    "local": false
  },
  {
    "url": "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=800",
    "title": "Творить и создавать",
    "category": "career",
    "tags": "карьера бизнес работа офис команда стартап career tech",
    "local": false
  },
  {
    "url": "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800",
    "title": "Город возможностей",
    "category": "career",
    "tags": "карьера бизнес работа офис команда стартап career tech",
    "local": false
  },
  {
    "url": "https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=800",
    "title": "Копить на мечту",
    "category": "wealth",
    "tags": "деньги богатство финансы достаток свобода wealth money",
    "local": false
  },
  {
    "url": "https://images.unsplash.com/photo-1563013544-824ae1d704d3?w=800",
    "title": "Личные финансы",
    "category": "wealth",
    "tags": "деньги богатство финансы достаток свобода wealth money",
    "local": false
  },
  {
    "url": "https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=800",
    "title": "Финансовая свобода",
    "category": "wealth",
    "tags": "деньги богатство финансы достаток свобода wealth money",
    "local": false
  },
  {
    "url": "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800",
    "title": "Золотой поток",
    "category": "wealth",
    "tags": "деньги богатство финансы достаток свобода wealth money",
    "local": false
  },
  {
    "url": "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800",
    "title": "Спокойствие и йога",
    "category": "health",
    "tags": "здоровье спорт йога медитация дыхание природа health",
    "local": false
  },
  {
    "url": "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=800",
    "title": "Дыхание природы",
    "category": "health",
    "tags": "здоровье спорт йога медитация дыхание природа health",
    "local": false
  },
  {
    "url": "https://images.unsplash.com/photo-1486218119243-13883505764c?w=800",
    "title": "Энергия движения",
    "category": "health",
    "tags": "здоровье спорт йога медитация дыхание природа health",
    "local": false
  },
  {
    "url": "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=800",
    "title": "Забота о себе",
    "category": "health",
    "tags": "здоровье спорт йога медитация дыхание природа health",
    "local": false
  },
  {
    "url": "https://images.unsplash.com/photo-1506929562872-bb421503ef21?w=800",
    "title": "Отпуск у моря",
    "category": "travel",
    "tags": "путешествия море океан горы отпуск отдых travel ocean sea",
    "local": false
  },
  {
    "url": "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800",
    "title": "Озеро среди гор",
    "category": "travel",
    "tags": "путешествия море океан горы отпуск отдых travel ocean sea",
    "local": false
  },
  {
    "url": "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800",
    "title": "Горные вершины",
    "category": "travel",
    "tags": "путешествия море океан горы отпуск отдых travel ocean sea",
    "local": false
  },
  {
    "url": "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=800",
    "title": "Навстречу приключениям",
    "category": "travel",
    "tags": "путешествия море океан горы отпуск отдых travel ocean sea",
    "local": false
  },
  {
    "url": "https://images.unsplash.com/photo-1511180595966-530979eb674c?w=800",
    "title": "Время вместе",
    "category": "relationships",
    "tags": "любовь семья отношения близость вместе relationships love",
    "local": false
  },
  {
    "url": "https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?w=800",
    "title": "Любовь и близость",
    "category": "relationships",
    "tags": "любовь семья отношения близость вместе relationships love",
    "local": false
  },
  {
    "url": "https://images.unsplash.com/photo-1542038784456-1ea8e935640e?w=800",
    "title": "Семейные воспоминания",
    "category": "relationships",
    "tags": "любовь семья отношения близость вместе relationships love",
    "local": false
  },
  {
    "url": "https://images.unsplash.com/photo-1517857398124-b624b5a2542a?w=800",
    "title": "Тепло отношений",
    "category": "relationships",
    "tags": "любовь семья отношения близость вместе relationships love",
    "local": false
  },
  {
    "url": "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=800",
    "title": "Учиться новому",
    "category": "growth",
    "tags": "рост хобби творчество обучение книга вдохновение growth art",
    "local": false
  },
  {
    "url": "https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=800",
    "title": "Свобода творчества",
    "category": "growth",
    "tags": "рост хобби творчество обучение книга вдохновение growth art",
    "local": false
  },
  {
    "url": "https://images.unsplash.com/photo-1518495973542-4542c06a5843?w=800",
    "title": "Свет и вдохновение",
    "category": "growth",
    "tags": "рост хобби творчество обучение книга вдохновение growth art",
    "local": false
  },
  {
    "url": "https://images.unsplash.com/photo-1447069387593-a5de0862481e?w=800",
    "title": "Время для книги",
    "category": "growth",
    "tags": "рост хобби творчество обучение книга вдохновение growth art",
    "local": false
  }
];
    function normalize(value) {
        return String(value || '').toLocaleLowerCase('ru').replace(/ё/g, 'е').trim();
    }
    function search(query, source = 'local', category = '') {
        const words = normalize(query).split(/\s+/).filter(Boolean);
        return items.filter(item => (source !== 'local' || item.local) &&
            words.every(word => normalize(item.title + ' ' + item.tags).includes(word)))
            .sort((a, b) => Number(b.category === category) - Number(a.category === category));
    }
    const api = { items, search };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.DreamBoardImageLibrary = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
