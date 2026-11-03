// Mock of api.yani.tv responses for offline UI preview (same shapes as the real API).
(function () {
  var T = [
    ['velikiy-pritvorschik', 'Великий притворщик', 2020, 'tv', 23, 8.2, 'Макото Эдамура, вероятно, величайший мошенник в Японии. Однажды вместе с партнёром он пытается обмануть француза в Асакусе, но вместо этого обманывают его самого.', 'released', ['Сэйнэн', 'Комедия', 'Детектив']],
    ['frieren', 'Провожающая в последний путь Фрирен', 2023, 'tv', 28, 9.1, 'Эльфийка-маг Фрирен победила Короля демонов вместе с отрядом героя. Спустя десятилетия она отправляется в новое путешествие, чтобы понять людей.', 'released', ['Приключения', 'Фэнтези', 'Драма']],
    ['magicheskaya-bitva', 'Магическая битва', 2020, 'tv', 24, 8.6, 'Школьник Юдзи Итадори съедает палец проклятого короля и оказывается втянут в мир магов, сражающихся с проклятиями.', 'released', ['Сёнэн', 'Экшен', 'Сверхъестественное']],
    ['ataka-titanov', 'Атака титанов', 2013, 'tv', 25, 8.9, 'Человечество живёт за огромными стенами, спасаясь от титанов. Эрен Йегер клянётся истребить их всех.', 'released', ['Сёнэн', 'Драма', 'Экшен']],
    ['klinok', 'Клинок, рассекающий демонов', 2019, 'tv', 26, 8.5, 'Танджиро становится охотником на демонов, чтобы вернуть человеческий облик своей сестре.', 'released', ['Сёнэн', 'Экшен', 'Исторический']],
    ['chelovek-benzopila', 'Человек-бензопила', 2022, 'tv', 12, 8.4, 'Дэндзи сливается со своим демоном-бензопилой и поступает на службу к охотникам на демонов.', 'released', ['Сёнэн', 'Экшен', 'Ужасы']],
    ['semya-shpiona', 'Семья шпиона', 2022, 'tv', 25, 8.6, 'Шпион, убийца и телепат притворяются обычной семьёй, не зная секретов друг друга.', 'released', ['Комедия', 'Повседневность', 'Экшен']],
    ['monolog-farmacevta', 'Монолог фармацевта', 2023, 'tv', 24, 8.8, 'Девушка-фармацевт попадает во внутренний дворец императора и раскрывает загадочные происшествия.', 'ongoing', ['Детектив', 'Исторический', 'Драма']],
    ['podnyatie-urovnya', 'Поднятие уровня в одиночку', 2024, 'tv', 12, 8.3, 'Самый слабый охотник Сон Джину получает таинственную систему, позволяющую ему становиться сильнее.', 'ongoing', ['Экшен', 'Фэнтези', 'Приключения']],
    ['dandadan', 'Дандадан', 2024, 'tv', 12, 8.7, 'Момо верит в призраков, а Окарун — в пришельцев. Спор приводит обоих к встрече с паранормальным.', 'ongoing', ['Комедия', 'Экшен', 'Сверхъестественное']],
    ['tetrad-smerti', 'Тетрадь смерти', 2006, 'tv', 37, 8.9, 'Школьник Лайт находит тетрадь, способную убить любого, чьё имя в неё записано.', 'released', ['Детектив', 'Триллер', 'Психология']],
    ['stalnoy-alhimik', 'Стальной алхимик: Братство', 2009, 'tv', 64, 9.2, 'Братья Элрики ищут философский камень, чтобы вернуть утраченное после запретного ритуала.', 'released', ['Приключения', 'Фэнтези', 'Драма']],
    ['tvoe-imya', 'Твоё имя', 2016, 'movie', 1, 8.9, 'Парень из Токио и девушка из провинции начинают время от времени меняться телами.', 'released', ['Романтика', 'Драма', 'Фэнтези']],
    ['unesennye-prizrakami', 'Унесённые призраками', 2001, 'movie', 1, 9.0, 'Тихиро попадает в мир духов и должна найти способ спасти родителей.', 'released', ['Приключения', 'Фэнтези']],
    ['kovboy-bibop', 'Ковбой Бибоп', 1998, 'tv', 26, 8.8, 'Команда охотников за головами путешествует по Солнечной системе на корабле «Бибоп».', 'released', ['Фантастика', 'Экшен', 'Драма']],
    ['vrata-shteyna', 'Врата Штейна', 2011, 'tv', 24, 9.1, 'Самопровозглашённый безумный учёный случайно изобретает способ отправлять сообщения в прошлое.', 'released', ['Фантастика', 'Триллер']],
    ['mob-psiho', 'Моб Психо 100', 2016, 'tv', 12, 8.5, 'Школьник с огромной экстрасенсорной силой пытается жить обычной жизнью.', 'released', ['Комедия', 'Экшен', 'Сверхъестественное']],
    ['vanpanchmen', 'Ванпанчмен', 2015, 'tv', 12, 8.5, 'Сайтама побеждает любого противника одним ударом и страдает от скуки.', 'released', ['Комедия', 'Экшен', 'Пародия']],
    ['vayolet', 'Вайолет Эвергарден', 2018, 'tv', 13, 8.7, 'Бывшая солдатка учится понимать чувства, работая составительницей писем.', 'released', ['Драма', 'Повседневность']],
    ['bocchi', 'Одинокий рокер!', 2022, 'tv', 12, 8.8, 'Застенчивая гитаристка Хитори Гото мечтает выступать в группе.', 'released', ['Комедия', 'Музыка', 'Повседневность']],
    ['zvezdnoe-ditya', 'Звёздное дитя', 2023, 'tv', 11, 8.6, 'Врач перерождается сыном своей любимой айдол-певицы.', 'released', ['Драма', 'Детектив']],
    ['sinyaya-tyurma', 'Синяя тюрьма', 2022, 'tv', 24, 8.1, 'Триста нападающих борются за право стать главным форвардом сборной Японии.', 'released', ['Спорт', 'Сёнэн']],
    ['kod-gias', 'Код Гиас: Восставший Лелуш', 2006, 'tv', 25, 8.8, 'Изгнанный принц получает силу абсолютного приказа и начинает восстание против империи.', 'released', ['Меха', 'Драма', 'Экшен']],
    ['re-zero', 'Re:Zero. Жизнь с нуля в альтернативном мире', 2016, 'tv', 25, 8.3, 'Субару попадает в другой мир и возвращается во времени после каждой смерти.', 'ongoing', ['Исэкай', 'Драма', 'Фэнтези']],
    ['kaiju-8', 'Кайдзю номер восемь', 2024, 'tv', 12, 8.0, 'Мусорщик Кафка мечтал служить в силах обороны — и сам превратился в кайдзю.', 'ongoing', ['Экшен', 'Фантастика']],
    ['sakamoto', 'Дни Сакамото', 2025, 'tv', 11, 8.1, 'Легендарный киллер ушёл на покой и открыл магазинчик, но прошлое не отпускает.', 'ongoing', ['Экшен', 'Комедия']],
    ['mag-chernogo-klevera', 'Чёрный клевер', 2017, 'tv', 170, 8.2, 'Аста рождён без магии, но мечтает стать Королём магов.', 'released', ['Сёнэн', 'Фэнтези', 'Экшен']],
    ['horimiya', 'Хоримия', 2021, 'tv', 13, 8.2, 'Популярная Хори и тихоня Миямура узнают друг о друге неожиданные секреты.', 'released', ['Романтика', 'Школа']],
    ['anons-1', 'Магическая битва: Смертельная миграция', 0, 'tv', 0, 0, '', 'announcement', ['Экшен']],
    ['anons-2', 'Человек-бензопила: Арка Резе', 0, 'movie', 1, 0, '', 'announcement', ['Экшен']]
  ];
  var TYPES = { tv: { name: 'Сериал', value: 1, shortname: 'ТВ', alias: 'tv' }, movie: { name: 'Полнометражный фильм', value: 2, shortname: 'п/ф', alias: 'movie' } };
  var ST = { released: { title: 'вышел', alias: 'released' }, ongoing: { title: 'онгоинг', alias: 'ongoing' }, announcement: { title: 'анонс', alias: 'announcement' } };
  function P(id) { var b = '//static.yani.tv/posters/'; return { small: b + 'small/' + id + '.webp', medium: b + 'medium/' + id + '.webp', big: b + 'big/' + id + '.webp', fullsize: b + 'full/' + id + '.jpg' }; }
  var all = T.map(function (t, i) {
    var id = 5445 + i;
    return {
      anime_id: id, anime_url: t[0], title: t[1], year: t[2], description: t[6], poster: P(id), type: TYPES[t[3]],
      anime_status: ST[t[7]], rating: t[5] ? { average: t[5], counters: 300 + i * 97, shikimori_rating: t[5] - 0.2, myanimelist_rating: t[5] - 0.1, kp_rating: t[5] - 0.6 } : { average: 0, counters: 0 },
      genres: t[8].map(function (g, k) { return { title: g, alias: 'g' + k, id: k }; }), views: 100000 - i * 2000,
      episodes: { count: t[4], aired: t[7] === 'ongoing' ? Math.max(1, t[4] - 3) : t[4], next_date: 0 },
      min_age: { value: 3, title: '16+' }, other_titles: [t[0].replace(/-/g, ' ')], studios: [{ title: 'Wit Studio' }]
    };
  });
  var byUrl = {}; all.forEach(function (a) { byUrl[a.anime_url] = a; byUrl[a.anime_id] = a; });
  function videosFor(a) {
    var n = a.episodes.aired || 1, out = [], vid = 1;
    var combos = [['Плеер Kodik', 'Озвучка AniLibria'], ['Плеер Kodik', 'Озвучка AniDUB'], ['Плеер Alloha', 'Озвучка AniLibria'], ['Плеер Kodik', 'Озвучка SHIZA Project'], ['Плеер Kodik', 'Субтитры YakuSub Studio'], ['Плеер CVH', 'Озвучка AniLibria']];
    combos.forEach(function (c, ci) {
      var cnt = ci === 3 ? Math.min(n, 10) : n;
      for (var e = 1; e <= cnt; e++) {
        out.push({
          video_id: a.anime_id * 1000 + vid++, number: String(e), date: 1700000000, duration: 1420,
          data: { player: c[0], dubbing: c[1] },
          iframe_url: /Kodik/.test(c[0]) ? '//kodikplayer.com/seria/' + a.anime_id + '/' + e + '/720p?episode=' + e
            : /CVH/.test(c[0]) ? '//ru.yummyani.me/iframeCVH.html?ep=' + e : '//alloha.yani.tv/?ep=' + e,
          skips: { opening: { time: 30, length: 85 }, ending: { time: 1300, length: 90 } }
        });
      }
    });
    return out;
  }
  function pickN(start, n) { var r = []; for (var i = 0; i < n; i++) r.push(all[(start + i) % 28]); return r; }
  window.__MOCK_IMPL = async function (path, params) {
    await new Promise(function (r) { setTimeout(r, 60); });
    params = params || {};
    if (path === '/feed') {
      return {
        top_carousel: { items: pickN(1, 12) },
        new_videos: pickN(7, 12).map(function (a, i) { return Object.assign({}, a, { ep_title: String(Math.max(1, a.episodes.aired - (i % 3))), dub_title: ['AniLibria', 'AniDUB', 'SHIZA Project'][i % 3], player_title: 'Kodik' }); }),
        new: pickN(14, 12), announcements: [all[28], all[29], all[24], all[25]], recommends: [],
        collections: [{ id: 24, title: 'Топовый исекай', likes: { likes: 166 }, owner: { nickname: 'Top4ikQm' } }, { id: 25, title: 'Аниме для первого знакомства', likes: { likes: 98 }, owner: { nickname: 'yummy' } },
          { id: 26, title: 'Лучшие детективы', likes: { likes: 74 }, owner: { nickname: 'Sherlock' } }, { id: 27, title: 'Уютная повседневность', likes: { likes: 51 }, owner: { nickname: 'chill' } }]
      };
    }
    if (path === '/anime/catalog') return { genres: { genres: ['Экшен', 'Комедия', 'Драма', 'Романтика', 'Фэнтези', 'Фантастика', 'Детектив', 'Повседневность', 'Сёнэн', 'Сэйнэн', 'Исэкай', 'Ужасы', 'Спорт', 'Музыка', 'Меха', 'Психология', 'Триллер', 'Школа', 'Исторический', 'Сверхъестественное'].map(function (g, i) { return { href: 'g' + i, title: g }; }) } };
    if (path === '/anime/schedule') {
      var now = Date.now() / 1000;
      return all.filter(function (a) { return a.anime_status.alias === 'ongoing'; }).concat(pickN(3, 10)).map(function (a, i) {
        return Object.assign({}, a, { episodes: { aired: a.episodes.aired, count: a.episodes.count, next_date: Math.floor(now + (i % 6) * 86400 + 3600 * (i % 5)) } });
      });
    }
    var m;
    if ((m = path.match(/^\/anime\/(\d+)\/recommendations$/))) return pickN(+m[1] % 28 + 3, 12);
    if (/\/trailers$/.test(path)) return [];
    if ((m = path.match(/^\/collection\/(\d+)$/))) return { title: 'Топовый исекай', animes: pickN(5, 14) };
    if ((m = path.match(/^\/anime\/([^/]+)$/))) {
      var a = byUrl[decodeURIComponent(m[1])];
      if (!a) throw new Error('Не найдено');
      var full = Object.assign({}, a, { videos: a.anime_status.alias === 'announcement' ? [] : videosFor(a), viewing_order: a.anime_id === 5445 ? [a, Object.assign({}, all[1], { data: { text: 'Спешл' } })] : [], trailers_count: 1,
        random_screenshots: [] });
      return full;
    }
    if (path === '/anime') {
      var list = all.slice(0, 28);
      if (params.q) { var q = String(params.q).toLowerCase(); list = all.filter(function (x) { return x.title.toLowerCase().indexOf(q) >= 0; }); }
      if (params.status && params.status.length) list = list.filter(function (x) { return params.status.indexOf(x.anime_status.alias) >= 0; });
      if (params.sort === 'random') list = list.slice().sort(function () { return Math.random() - 0.5; });
      var off = +params.offset || 0, lim = +params.limit || 20;
      if (!params.q && off < 80) { var out = []; for (var i = 0; i < lim; i++) out.push(list[(off + i) % list.length]); return out; }
      return list.slice(off, off + lim);
    }
    return [];
  };
  // url -> (path, params) adapter used by the app (direct mode) and by the test server
  window.__MOCK_URL = function (url) {
    var u = new URL(url), params = {};
    u.searchParams.forEach(function (v, k) { params[k] = /,/.test(v) && k !== 'q' ? v.split(',') : v; });
    return window.__MOCK_IMPL(u.pathname, params);
  };
  if (!window.__NET_MOCK) window.__MOCK_API = window.__MOCK_URL;
})();
