"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const validator_1 = __importDefault(require("validator"));
const lodash_1 = __importDefault(require("lodash"));
const topics_1 = require("../topics");
const user_1 = __importDefault(require("../user"));
const plugins_1 = __importDefault(require("../plugins"));
const categories_1 = require("../categories");
const utils_1 = require("../utils");
function default_1(Posts) {
    function getTopicAndCategories(tids) {
        return __awaiter(this, void 0, void 0, function* () {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
            const topicsData = yield (0, topics_1.getTopicsFields)(tids, [
                'uid', 'tid', 'title', 'cid', 'tags', 'slug',
                'deleted', 'scheduled', 'postcount', 'mainPid', 'teaserPid',
            ]);
            const cids = lodash_1.default.uniq(topicsData.map(topic => topic && topic.cid));
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
            const categoriesData = yield (0, categories_1.getCategoriesFields)(cids, [
                'cid', 'name', 'icon', 'slug', 'parentCid',
                'bgColor', 'color', 'backgroundImage', 'imageClass',
            ]);
            return { topics: topicsData, categories: categoriesData };
        });
    }
    function toObject(key, data) {
        const obj = {};
        for (let i = 0; i < data.length; i += 1) {
            obj[data[i][key]] = data[i];
        }
        return obj;
    }
    function stripTags(content) {
        if (content) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return
            return (0, utils_1.stripHTMLTags)(content, utils_1.util.stripTags);
        }
        return content;
    }
    function parsePosts(posts, options) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield Promise.all(posts.map((post) => __awaiter(this, void 0, void 0, function* () {
                if (!post.content || !options.parse) {
                    post.content = post.content ? validator_1.default.escape(String(post.content)) : post.content;
                    return post;
                }
                post = yield Posts.parsePost(post);
                if (options.stripTags) {
                    post.content = stripTags(post.content);
                }
                return post;
            })));
        });
    }
    Posts.getPostSummaryByPids = function (pids, uid, options) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!Array.isArray(pids) || !pids.length) {
                return [];
            }
            options.stripTags = options.hasOwnProperty('stripTags') ? options.stripTags : false;
            options.parse = options.hasOwnProperty('parse') ? options.parse : true;
            options.extraFields = options.hasOwnProperty('extraFields') ? options.extraFields : [];
            const fields = ['pid', 'tid', 'content', 'uid', 'timestamp', 'deleted', 'upvotes', 'downvotes', 'replies', 'handle'].concat(options.extraFields);
            let posts = yield Posts.getPostsFields(pids, fields);
            posts = posts.filter(Boolean);
            // eslint-disable-next-line
            posts = yield user_1.default.blocks.filter(uid, posts);
            const uids = lodash_1.default.uniq(posts.map(p => p && p.uid));
            const tids = lodash_1.default.uniq(posts.map(p => p && p.tid));
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const [users, topicsAndCategories] = yield Promise.all([
                // eslint-disable-next-line @typescript-eslint/no-unsafe-call
                user_1.default.getUsersFields(uids, ['uid', 'username', 'userslug', 'picture', 'status']),
                getTopicAndCategories(tids),
            ]);
            const uidToUser = toObject('uid', users);
            const tidToTopic = toObject('tid', topicsAndCategories.topics);
            const cidToCategory = toObject('cid', topicsAndCategories.categories);
            posts.forEach((post) => {
                // If the post author isn't represented in the retrieved users' data,
                // then it means they were deleted, assume guest.
                if (!uidToUser.hasOwnProperty(post.uid)) {
                    post.uid = 0;
                }
                post.user = uidToUser[post.uid];
                Posts.overrideGuestHandle(post, post.handle);
                post.handle = undefined;
                post.topic = tidToTopic[post.tid];
                post.category = post.topic && cidToCategory[post.topic.cid];
                post.isMainPost = post.topic && post.pid === post.topic.mainPid;
                post.deleted = post.deleted === 1;
                // eslint-disable-next-line
                post.timestampISO = utils_1.util.toISOString(post.timestamp);
            });
            posts = posts.filter(post => tidToTopic[post.tid]);
            posts = yield parsePosts(posts, options);
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const result = yield plugins_1.default.hooks.fire('filter:post.getPostSummaryByPids', { posts: posts, uid: uid });
            return result.posts;
        });
    };
}
exports.default = default_1;
